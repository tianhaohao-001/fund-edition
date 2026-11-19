import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { CatalogEntry, ScreenProps } from '../types';
import VoiceComposer from '../VoiceComposer';
// This is the same pure, DOM-free research copy consumed by the website.
import { catalogSampleLabel, catalogAssumptions } from '../../../web/catalog-copy.mjs';

type Entry = CatalogEntry & {
  color?: string; mark?: string; risk?: string; researchStatus?: string; selection?: string;
  allocation?: number; model?: string; assets?: {value:number; asOf:string; label:string};
};
type Study = {
  kind:string; source:string; startDate:string; endDate:string;
  metrics:{returnPercent:number; benchmarkReturnPercent:number; maxDrawdownPercent:number; endingEquity:number; tradeCount:number};
  points:Array<{date:string; equity:number; benchmarkEquity:number}>;
  trades:Array<{date:string; signalDate?:string; action:string; units:number; price:number}>;
};
type Paper = {
  cash:number; unitsMicros:number; equity?:number; units?:number; quote?:{date:string; kind:string};
  history:Array<{side:string; units?:number; value?:number; quoteDate?:string}>;
};
const USD = new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2});
const number = new Intl.NumberFormat('en-US',{maximumFractionDigits:2});
const money = (value:number) => USD.format(value);
const percent = (value:number) => `${value>0?'+':''}${number.format(value)}%`;
const ink='#101023';

export default function FundsScreen({workspace, language, busy, act, transcribe, speak}:ScreenProps) {
  const zh=language==='zh-CN';
  const t=(cn:string,en:string)=>zh?cn:en;
  const [section,setSection]=useState<'market'|'persona'>('market');
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [amount,setAmount]=useState('1000');
  const [notes,setNotes]=useState(false);
  const [rules,setRules]=useState(false);
  const [localBusy,setLocalBusy]=useState(false);
  const [notice,setNotice]=useState<'bought'|'sold'|'calculated'|null>(null);
  const lock=useRef(false);
  const scroll=useRef<React.ComponentRef<typeof ScrollView>>(null);
  const waiting=busy||localBusy;

  function localize(original:CatalogEntry):Entry {
    const base=original as Entry;
    const copy=base.localized?.[language] as (Partial<Entry>&{assetLabel?:string;sourceTitles?:string[]})|undefined;
    if(!copy)return base;
    return {...base,...copy,
      assets:base.assets?{...base.assets,label:copy.assetLabel??base.assets.label}:undefined,
      sources:base.sources.map((source,index)=>({...source,title:copy.sourceTitles?.[index]??source.title})),
    };
  }
  const items=(workspace.catalog??[]).map(localize);
  const item=items.find(entry=>entry.id===selectedId);
  const account=item?workspace.catalogAccounts?.[item.id] as Paper|undefined:undefined;
  const study=item?workspace.catalogBacktests?.[item.id] as Study|undefined:undefined;

  useEffect(()=>{setAmount('1000');setNotes(false);setRules(false);setNotice(null);scroll.current?.scrollTo({y:0,animated:false});},[selectedId]);

  async function action(body:{action:string;[key:string]:unknown}, next?:'bought'|'sold'|'calculated') {
    if(lock.current||busy)return;
    lock.current=true;setLocalBusy(true);setNotice(null);
    try{await act(body);if(next)setNotice(next);}
    catch{/* App owns the visible, localized server error; drafts remain here. */}
    finally{lock.current=false;setLocalBusy(false);}
  }
  function select(entry:Entry){setSelectedId(entry.id);}
  const button=(label:string,onPress:()=>void,secondary=false,disabled=waiting)=><Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress}
    style={[styles.button,secondary&&styles.secondary,disabled&&styles.disabled]}><Text style={[styles.buttonText,secondary&&styles.secondaryText]}>{label}</Text></Pressable>;
  const metric=(label:string,value:string)=><View key={label} style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>;

  return <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS==='ios'?'padding':undefined}>
    <ScrollView ref={scroll} style={styles.fill} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      {!item?<>
        <Text style={styles.eyebrow}>MORROWFOLIO / {t('基金广场','FUNDS')}</Text>
        <Text accessibilityRole="header" style={styles.title}>{t('AI 基金广场','AI Funds')}</Text>
        <Text style={styles.lead}>{t('找到一种投资方法，认识它的团队，用模拟资金体验。','Find an investment approach, meet its team and try it with simulated funds.')}</Text>
        <View style={styles.paperBadge}><Text style={styles.paperBadgeText}>● {t('独立模拟研究账户','Independent simulated research accounts')}</Text></View>
        <View style={styles.tabs}>{(['market','persona'] as const).map(tab=><Pressable key={tab} accessibilityRole="tab" accessibilityState={{selected:section===tab}} onPress={()=>setSection(tab)}
          style={[styles.tab,section===tab&&styles.activeTab]}><Text style={[styles.tabText,section===tab&&styles.activeTabText]}>{tab==='market'?t('市场基金研究','Market research'):t('人物风格','Investor styles')}</Text></Pressable>)}</View>
        <Text accessibilityRole="header" style={styles.sectionTitle}>{section==='market'?t('精选主动策略','Selected active strategies'):t('一场有风格的投委会','An investment committee with character')}</Text>
        <Text style={styles.caption}>{section==='market'?t('规模型基金与特色策略，按公开方法选集。','Substantial funds and distinctive strategies, selected by public approach.'):t('以公开理念创作的 AI 角色，非本人或背书。','AI characters inspired by public ideas, not the people or their endorsement.')}</Text>
        {items.filter(entry=>entry.section===section).map(entry=><Pressable key={entry.id} accessibilityRole="button" accessibilityLabel={`${entry.name}, ${entry.reference}`} onPress={()=>select(entry)} style={styles.fundCard}>
          <View style={styles.identity}><View style={[styles.mark,{backgroundColor:`${entry.color??'#6278e8'}18`}]}><Text style={[styles.markText,{color:entry.color??'#6278e8'}]}>{entry.mark??entry.name.slice(0,2)}</Text></View>
            <View style={styles.flex}><Text style={styles.fundName}>{entry.name}</Text><Text style={styles.reference}>{entry.ticker} · {entry.reference}</Text></View><Text style={styles.arrow}>↗</Text></View>
          <Text style={styles.summary}>{entry.summary}</Text><Text style={styles.category}>{entry.category} · {entry.risk}</Text>
          <View style={styles.cardFoot}><Text style={styles.status}>{entry.researchStatus}</Text>{entry.assets?<Text style={styles.asset}>${number.format(entry.assets.value/1e9)}B · {entry.assets.asOf}</Text>:null}</View>
        </Pressable>)}
        {!items.length?<Text style={styles.caption}>{t('正在读取基金目录…','Loading the fund catalog…')}</Text>:null}
        <Text style={styles.footer}>{t('先聊明白，再做决定。每个团队都能解释策略、风险和研究进度。','Understand first. Then decide. Ask every team about its strategy, risks and research.')}</Text>
      </>:<>
        {button(t('← AI 基金广场','← AI Funds'),()=>setSelectedId(null),true,false)}
        <View style={styles.identity}><View style={[styles.mark,styles.largeMark,{backgroundColor:`${item.color??'#6278e8'}18`}]}><Text style={[styles.markText,{color:item.color??'#6278e8'}]}>{item.mark}</Text></View><View style={styles.flex}>
          <Text style={styles.eyebrow}>{item.ticker} / {item.category}</Text><Text accessibilityRole="header" style={styles.detailTitle}>{item.name}</Text><Text style={styles.reference}>{item.reference}</Text></View></View>
        <Text style={styles.status}>{item.researchStatus} · {item.risk}</Text>
        <Text style={styles.lead}>{item.summary}</Text>
        {item.approach.map((step,index)=><View key={step} style={styles.step}><Text style={styles.stepIndex}>{String(index+1).padStart(2,'0')}</Text><Text style={styles.stepText}>{step}</Text></View>)}

        <View style={styles.panel}>
          <Text style={styles.eyebrow}>{t('模拟投资','PAPER INVESTING')}</Text><Text accessibilityRole="header" style={styles.sectionTitle}>{t('体验这支基金','Try this fund')}</Text>
          <Text style={styles.caption}>{t('每个策略有独立的 $10,000 模拟沙盒，未连接真实资金。','Each strategy has its own $10,000 simulated sandbox, separate from real money.')}</Text>
          <View style={styles.metrics}>{metric(t('可用模拟现金','Available simulated cash'),money(account?.cash??10000))}{metric(t('持有模拟份额','Simulated units held'),number.format((account?.unitsMicros??0)/1e6))}</View>
          {account?.quote?<Text style={styles.caption}>{catalogSampleLabel(account.quote.kind,language)} · {account.quote.date}</Text>:null}
          <Text style={styles.inputLabel}>{t('模拟买入金额（美元）','Simulated purchase amount (USD)')}</Text>
          <TextInput accessibilityLabel={t('模拟买入金额','Simulated purchase amount')} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" editable={!waiting} style={styles.input} selectTextOnFocus />
          {button(t('模拟买入 ↗','Simulate buy ↗'),()=>{void action({action:'catalogBuy',catalogId:item.id,amount:Number(amount)},'bought');},false,waiting||!Number.isFinite(Number(amount))||Number(amount)<10||Number(amount)>10000)}
          {(account?.unitsMicros??0)>0?button(t('卖出全部模拟份额','Sell all simulated units'),()=>{void action({action:'catalogSell',catalogId:item.id},'sold');},true):null}
          {account?.equity!==undefined?metric(t('这个沙盒的模拟总资产','Total simulated sandbox equity'),money(account.equity)):null}
          {notice?<Text accessibilityLiveRegion="polite" style={styles.success}>{notice==='bought'?t('模拟买入已记账。','Simulated purchase recorded.'):notice==='sold'?t('模拟份额已卖清。','Simulated units sold.'):t('计算已完成。','Calculation complete.')}</Text>:null}
          {account?.history.length?<View style={styles.history}><Text style={styles.inputLabel}>{t('模拟成交记录','Simulated trade history')}</Text>{account.history.slice(0,6).map((trade,index)=><View key={index} style={styles.trade}><Text style={styles.tradeText}>{trade.side==='BUY'?t('买入','Buy'):t('卖出','Sell')} {number.format(trade.units??0)} {t('份','units')}</Text><Text style={styles.tradeText}>{money(trade.value??0)} · {trade.quoteDate}</Text></View>)}</View>:null}
          <Text style={styles.fine}>{t('程序独立校验现金与份额；点差为 5 个基点，再向不利方向取整到分。','Cash and units are independently checked. A 5-basis-point spread is rounded adversely to cents.')}</Text>
        </View>

        <View style={styles.panel}>
          <Text style={styles.eyebrow}>{t('价格实验','PERFORMANCE LAB')}</Text><Text accessibilityRole="header" style={styles.sectionTitle}>{t('让方法接受检验','Put the method to the test')}</Text>
          <Text style={styles.caption}>{item.id==='contrafund'?t('Fidelity 官方月末净值 · 价格实验','Fidelity official month-end NAV · price experiment'):t('合成情景 · 方法实验','Synthetic scenario · method experiment')}</Text>
          {button(t('计算 / 重算实验 ↻','Calculate / recalculate ↻'),()=>{void action({action:'catalogBacktest',catalogId:item.id},'calculated');},true)}
          {study?<><Text style={styles.caption}>{study.startDate} — {study.endDate} · {study.points.length} {t('个观察点','observations')}</Text>
            <View style={styles.metrics}>{metric(t('规则价格收益','Rule price return'),percent(study.metrics.returnPercent))}{metric(t('同价格买入持有','Same-price buy and hold'),percent(study.metrics.benchmarkReturnPercent))}{metric(t('观察点最大回撤','Maximum observed drawdown'),`${number.format(study.metrics.maxDrawdownPercent)}%`)}{metric(t('期末模拟资产','Ending simulated equity'),money(study.metrics.endingEquity))}</View>
            {button(rules?t('收起规则与成交','Hide rules and fills'):t('计算规则与逐笔成交','Rules and individual fills'),()=>setRules(!rules),true,false)}
            {rules?<><Text style={styles.caption}>{catalogSampleLabel(study.kind,language)}</Text>{catalogAssumptions(item,language).map((text:string)=><Text key={text} style={styles.body}>• {text}</Text>)}
              {study.source.startsWith('https://')?<Pressable accessibilityRole="link" onPress={()=>{void Linking.openURL(study.source);}}><Text style={styles.link}>{t('查看价格原始来源 ↗','View original price source ↗')}</Text></Pressable>:<Text style={styles.fine}>{study.source}</Text>}
              {study.trades.slice(0,20).map((trade,index)=><Text key={index} style={styles.fine}>{trade.signalDate} → {trade.date} · {trade.action==='BUY'?t('买入','Buy'):t('卖出','Sell')} {number.format(trade.units)} · {money(trade.price)}</Text>)}
              {study.trades.length>20?<Text style={styles.fine}>{t('显示前20笔成交。完整记录可在网页研究工具查看。','Showing the first 20 fills. The web research tool contains the full record.')}</Text>:null}</>:null}
          </>:<Text style={styles.fine}>{t('点击计算查看真实可重算的实验结果，不预填虚构业绩。','Calculate to inspect reproducible experiment results. Performance is not prefilled.')}</Text>}
        </View>

        <View style={styles.panel}>
          <Text style={styles.eyebrow}>{t('认识团队','MEET THE TEAM')}</Text><Text accessibilityRole="header" style={styles.sectionTitle}>{t('好策略，应该经得起提问。','A good strategy should stand up to questions.')}</Text>
          {item.team.map((member,index)=><View key={`${member.role}-${index}`} style={styles.member}><View style={styles.memberMark}><Text style={styles.memberInitial}>{String(index+1).padStart(2,'0')}</Text></View><View style={styles.flex}><Text style={styles.memberName}>{member.name}</Text><Text style={styles.category}>{member.role}</Text><Text style={styles.caption}>{member.duty}</Text></View></View>)}
          <Text style={workspace.provider.chatEnabled?styles.success:styles.caption}>{workspace.provider.chatEnabled?t('● HarnessRouter Agent 已连接','● HarnessRouter Agent connected'):t('AI 尚未连接，请先检查服务器配置。','AI is not connected. Check the server configuration first.')}</Text>
          {(workspace.catalogChats?.[item.id]??[]).map((message,index)=><View key={message.id??index} style={[styles.message,message.role==='user'&&styles.userMessage]}>
            <Text style={styles.messageName}>{message.role==='user'?t('你','You'):`${item.name} · ${t('AI 经理','AI manager')}`}</Text><Text selectable style={styles.messageText}>{message.text}</Text>
            {message.source?<Text style={styles.fine}>{message.source}</Text>:null}{message.role==='assistant'?<Pressable accessibilityRole="button" accessibilityLabel={t('朗读回答','Read reply aloud')} onPress={()=>speak(message.text)} style={styles.read}><Text style={styles.link}>{t('朗读 ↗','Read aloud ↗')}</Text></Pressable>:null}
          </View>)}
          <VoiceComposer key={item.id} language={language} disabled={waiting||!workspace.provider.chatEnabled} transcribe={transcribe} label={t('向基金经理提问','Ask the fund manager')}
            placeholder={t('为什么这样配置？市场下跌时会怎么做？','Why this allocation? What happens if markets fall?')}
            onSend={async(message)=>{await act({action:'catalogChat',catalogId:item.id,message,provider:'harnessrouter'});}} />
        </View>
        {button(notes?t('收起研究方法与公开来源','Hide methods and public sources'):t('研究方法与公开来源','Research methods and public sources'),()=>setNotes(!notes),true,false)}
        {notes?<View style={styles.panel}><Text style={styles.body}>{item.limitations}</Text><Text style={styles.body}>{item.selection}</Text>{item.assets?<Text style={styles.caption}>{item.assets.label} · ${number.format(item.assets.value/1e9)}B · {item.assets.asOf}</Text>:null}
          {item.sources.map(source=><Pressable key={source.url} accessibilityRole="link" onPress={()=>{void Linking.openURL(source.url);}} style={styles.source}><Text style={styles.link}>{source.title} ↗</Text><Text style={styles.fine}>{new URL(source.url).hostname}</Text></Pressable>)}
          <Text style={styles.fine}>{t('原始披露导入与完整持仓拟合工具可在网页版使用。','The web app provides original-disclosure imports and the full holdings-comparison tool.')}</Text>
        </View>:null}
      </>}
    </ScrollView>
  </KeyboardAvoidingView>;
}

const styles=StyleSheet.create({
  fill:{flex:1,backgroundColor:'#F3F5FA'},page:{padding:20,gap:16,paddingBottom:48},flex:{flex:1,minWidth:0},
  eyebrow:{fontSize:11,lineHeight:16,letterSpacing:1.3,color:'#597089',fontWeight:'700'},title:{fontSize:32,lineHeight:38,color:ink,fontWeight:'700'},detailTitle:{fontSize:26,lineHeight:32,color:ink,fontWeight:'700'},lead:{fontSize:16,lineHeight:26,color:'#5B6C81'},
  paperBadge:{alignSelf:'flex-start',borderWidth:1,borderColor:'#D8E1EB',borderRadius:20,paddingHorizontal:12,paddingVertical:8},paperBadgeText:{fontSize:11,color:'#397B6D'},
  tabs:{flexDirection:'row',backgroundColor:'#E6EBF3',borderRadius:12,padding:4,gap:4},tab:{flex:1,minHeight:48,borderRadius:9,alignItems:'center',justifyContent:'center',padding:8},activeTab:{backgroundColor:'#FFF'},tabText:{fontSize:14,color:'#697C92',fontWeight:'600',textAlign:'center'},activeTabText:{color:'#3444A2'},
  sectionTitle:{fontSize:21,lineHeight:28,fontWeight:'700',color:ink},caption:{fontSize:13,lineHeight:21,color:'#738196'},
  fundCard:{backgroundColor:'#FFF',borderWidth:1,borderColor:'#DCE3EC',borderRadius:14,padding:16,gap:12},identity:{flexDirection:'row',gap:12,alignItems:'center'},mark:{width:42,height:42,borderRadius:11,justifyContent:'center',alignItems:'center'},largeMark:{width:52,height:52},markText:{fontSize:15,fontWeight:'700'},fundName:{fontSize:17,lineHeight:23,fontWeight:'700',color:ink},reference:{fontSize:12,lineHeight:19,color:'#6A7B91'},arrow:{color:'#8B98AC',fontSize:22},summary:{fontSize:14,lineHeight:23,color:'#55677F'},category:{fontSize:12,lineHeight:19,color:'#7989A0'},cardFoot:{gap:6},status:{fontSize:12,lineHeight:19,color:'#3C6D68',fontWeight:'600'},asset:{fontSize:12,lineHeight:18,color:'#5C6C83'},footer:{fontSize:13,lineHeight:22,color:'#75859A',paddingVertical:16},
  step:{flexDirection:'row',gap:14,paddingVertical:8},stepIndex:{fontSize:18,color:'#9CABBC',fontWeight:'700'},stepText:{flex:1,fontSize:14,lineHeight:23,color:'#53667F'},panel:{backgroundColor:'#FFF',borderRadius:14,borderWidth:1,borderColor:'#DCE3EC',padding:16,gap:14},
  button:{backgroundColor:'#5352C5',minHeight:48,borderRadius:10,alignItems:'center',justifyContent:'center',paddingHorizontal:14,paddingVertical:12},buttonText:{color:'#FFF',fontSize:15,fontWeight:'600',textAlign:'center',lineHeight:22},secondary:{backgroundColor:'#EBEDF8'},secondaryText:{color:'#494C91'},disabled:{opacity:.45},metrics:{flexDirection:'row',flexWrap:'wrap',gap:14},metric:{flexGrow:1,minWidth:'43%',gap:5,paddingVertical:6},metricLabel:{fontSize:12,lineHeight:18,color:'#77869B'},metricValue:{fontSize:22,lineHeight:29,fontWeight:'700',color:ink},inputLabel:{fontSize:13,lineHeight:20,color:'#334B67',fontWeight:'600'},input:{borderWidth:1,borderColor:'#D8E0EA',borderRadius:10,padding:14,fontSize:18,minHeight:50,color:ink,backgroundColor:'#F8FAFD'},
  success:{color:'#2A7E65',fontSize:13,lineHeight:22,fontWeight:'600'},fine:{fontSize:11,lineHeight:18,color:'#8995A6'},body:{fontSize:14,lineHeight:24,color:'#53677F'},link:{fontSize:13,lineHeight:22,color:'#494CB0',fontWeight:'600'},source:{paddingVertical:12,borderTopWidth:1,borderTopColor:'#E9EDF3'},history:{gap:10},trade:{gap:3,borderTopWidth:1,borderTopColor:'#E9EDF3',paddingTop:9},tradeText:{fontSize:12,color:'#63768E',lineHeight:19},
  member:{flexDirection:'row',gap:12,paddingVertical:8},memberMark:{width:34,height:34,borderRadius:17,backgroundColor:'#ECEBF6',alignItems:'center',justifyContent:'center'},memberInitial:{fontSize:12,color:'#68629A'},memberName:{fontSize:14,fontWeight:'600',color:'#3E5572',lineHeight:22},message:{backgroundColor:'#F3F5FA',padding:14,borderRadius:12,gap:8},userMessage:{backgroundColor:'#EEECFC'},messageName:{fontSize:12,lineHeight:20,color:'#4F6091',fontWeight:'600'},messageText:{fontSize:15,lineHeight:25,color:'#445D7C'},read:{minHeight:44,justifyContent:'center',alignSelf:'flex-start'},
});
