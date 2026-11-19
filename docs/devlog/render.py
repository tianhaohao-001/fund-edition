"""Build the bilingual public article from the editorial Markdown and acceptance images."""
from html import escape
from pathlib import Path
import argparse
import re
import shutil

here = Path(__file__).resolve().parent
root = here.parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--output-dir", type=Path, help="Render into a separate directory for verification.")
arguments = parser.parse_args()
web = arguments.output_dir.resolve() if arguments.output_dir else root / "web"
images = web / "assets/build-log"
images.mkdir(parents=True, exist_ok=True)
site = "https://fund-edition-web-production.up.railway.app"
sources = {
    "../build-log.md": "#engineering",
    "../execution-audit.md": "#engineering",
    "../buffett-paper-protocol.md": site + "/data/buffett-ai-study.json",
    "../../release/review-web/public-release/railway-production-journeys.json": "#checks",
    "../../release/review-web/public-release/railway-live-persistence.json": "#checks",
}
links = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")


def inline(line, language):
    def link(match):
        label, url = match.groups()
        url = sources.get(url, url)
        if url.startswith("#"):
            url += "-" + language
        elif not url.startswith("https://"):
            raise ValueError("Unmapped source link " + url)
        return '<a href="' + url + '">' + label + "</a>"

    out = links.sub(link, escape(line))
    out = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", out)
    return re.sub(r"`([^`]+)`", r"<code>\1</code>", out)


def plate(name, language, caption):
    if name == "studio":
        folder = root / "release/review-web/maya-candidate-visual"
        stem = ("zh-" if language == "zh" else "") + "proposal-"
    elif name == "office":
        folder = root / "release/review-web/office-entry"
        stem = "office-zh-CN-" if language == "zh" else "office-en-US-"
    else:
        folder = root / "release/review-web/buffett-decision-desk"
        stem = "zh-CN-" if language == "zh" else "en-US-"
    image_urls = {}
    for width in (390, 1440):
        filename = f"{name}-{language}-{width}.png"
        src = folder / (stem + str(width) + ("-buy" if name == "meeting" else "") + ".png")
        shutil.copyfile(src, images / filename)
        image_urls[width] = "/assets/build-log/" + filename
    sm, lg = image_urls[390], image_urls[1440]
    return f'<figure class="plate"><a class="enlarge" href="{lg}" data-mobile-image="{sm}"><picture><source media="(max-width: 620px)" srcset="{sm}"><img src="{lg}" loading="lazy" width="1440" height="900" alt="{escape(caption)}"></picture></a><figcaption>{escape(caption)}</figcaption></figure>'


def capital_ledger(language):
    labels = (["第一只自建基金", "第二只自建基金", "ARKK 策略持仓", "尚未分配现金", "组合总权益", "累计投入本金", "投资盈亏"]
              if language == "zh" else
              ["First self-built fund", "Second self-built fund", "ARKK strategy holding", "Unallocated cash", "Portfolio equity", "Contributed capital", "Investment profit"])
    caption = ("一个本地隔离账户，主动领取两次后的对账 · 单位为模拟美元" if language == "zh" else
               "One isolated local account after two deliberate cash claims · all amounts in paper USD")
    amounts = ["100,000", "25,000", "12,500", "162,500", "300,000", "300,000", "0"]
    rows = "".join(f"<dt>{escape(label)}</dt><dd>{amount}</dd>" for label, amount in zip(labels, amounts))
    return f'<figure class="team-chart"><figcaption>{escape(caption)}</figcaption><dl>{rows}</dl></figure>'


def article(language):
    zh = language == "zh"
    loc = "zh-CN" if zh else "en-US"
    lines = (here / ("zh-CN.md" if zh else "README.md")).read_text(encoding="utf-8").splitlines()
    title = "Maya 在公网沉默的那一晚" if zh else "How Fund Edition's AI teams and paper-trading system work"
    name = "开发手记" if zh else "Build journal"
    date = "2026 年 11 月 15–19 日 · 太平洋时间" if zh else "November 15–19, 2026 · Pacific time"
    deck = "两人团队如何与 45 位 AI 同事做出 Fund Edition" if zh else "Data sources, role assignments, execution and background work"
    out = [f'<article id="{language}" lang="{loc}"><header class="cover"><div class="cover-copy"><p class="journal">{name} <span>/</span> The Big Hack Game</p><h1>{title}</h1><p class="deck">{deck}</p><p class="date">{date}</p></div><figure class="cover-image"><img width="1200" height="800" src="/assets/studio-interior.jpg" alt="' + ("基金团队的两层剖面办公室，工位围着共享空间分布。" if zh else "Cutaway of the team office, with desks around a shared workspace.") + '"></figure></header><div class="body">']
    slugs = (["origin", "company", "execution", "voice-routing", "hiring", "committee", "cloud", "incident", "office", "timing", "watch-and-invoices", "payment-entry", "return-journeys", "evidence-review", "company-review", "studio-capital", "manager-contact"] if zh else ["architecture", "sources", "data-validation", "team-configuration", "committee", "execution", "studio-capital", "watch-scheduler", "watch-worker", "costs", "cloud", "company", "manager-contact"])
    excerpts = {
        "execution": ("Independent ledger comparison", "独立引擎交叉对账", "bt 1.4.1 / 23 quarters / 46 fills / $15,835.87186717 against $15,835.89. Input series: quarterly NAV total return, distributions reinvested.", "bt 1.4.1，23 个季度，46 笔成交。期末两边为 15,835.87186717 与 15,835.89 美元。输入为含分配再投资的季度净值总回报。"),
        "voice-routing": ("Replay the routing test", "复看路由用例", "The raw Mandarin input asked about Wellington. The tester added “不做历史回测，我想让团队决定下一期怎么配置。” The real manager returned the prospective meeting route. Receipt resp_8a2c9ba9895d437d85c1c8137b6fc4c5.", "原转写是研究惠灵顿基金，校对后另加“不做历史回测，我想让团队决定下一期怎么配置。” 实际经理识别为下一期会议，回执 resp_8a2c9ba9895d437d85c1c8137b6fc4c5。"),
        "hiring": ("The first real employee reply", "首发版员工真实回执", "Public studio, Chinese, 390-pixel browser. Three seats: Maya Chen, Jules Bennett and Avery Khan. Jules answered a cash-flow question. Receipt resp_8eeaeee6f7964871a2ccb92ba1f48684.", "正式网站，中文 390 像素宽浏览器。三席为 Maya Chen、Jules Bennett 和 Avery Khan。Jules 回答现金流问题，回执 resp_8eeaeee6f7964871a2ccb92ba1f48684。"),
        "incident": ("The first line in the failed build", "失败构建的第一条报错", "19:32 Pacific — dockerfile invalid: docker VOLUME at Line 9 is not supported, use Railway Volumes. First successful listener at 19:33:52. New listener after restart at 19:35:42.", "19:32 太平洋时间：dockerfile invalid: docker VOLUME at Line 9 is not supported, use Railway Volumes。19:33:52 首次成功监听，19:35:42 重启后再次监听。"),
        "office": ("Reopen an existing office", "回到同一间办公室", "The four-person local 390-pixel check measured y=254.23 to 497.28. On the updated production app, an existing visitor selected Theo and a new visitor received a teammate’s free-form answer, resp_5179ea718d124ca7ac48ef1055d67942.", "本机四人团队 390 像素测试中，办公室纵向范围为 254.23 到 497.28 像素。二期生产域原访客能点回 Theo，另一新访客的员工自由问答回执为 resp_5179ea718d124ca7ac48ef1055d67942。"),
        "timing": ("Check a rejected model answer", "追溯被退回的回答", "The Wellington benchmark uses NAV total returns including reinvested distributions. Two post-fix answers took 8.70 and 8.32 s for the complete validated text. The first receipt was resp_b56c1f4b09fb434dac47d4c698923a2c.", "惠灵顿基准为含分配再投资的净值总回报。纠正后的两次完整可展示答案耗时 8.70、8.32 秒。其一回执为 resp_b56c1f4b09fb434dac47d4c698923a2c。")
    }
    def close_section(index):
        excerpt = excerpts.get(slugs[index])
        if excerpt:
            title, text = (excerpt[1], excerpt[3]) if zh else (excerpt[0], excerpt[2])
            out.append(f'<details class="checkpoint"><summary>{escape(title)}</summary><p>{escape(text)}</p></details>')
        out.append("</section>")
    headings = [row[3:].split(" · ", 1) for row in lines if row.startswith("## ")]
    if len(headings) != len(slugs):
        raise ValueError("Provide a stable deep link for every dated entry.")
    chapter_links = ''.join(f'<li><a href="#{slug}-{language}"><span>{escape(stamp)}</span>{escape(label)}</a></li>' for slug, (stamp,label) in zip(slugs,headings))
    contents = '<details class="contents"><summary>' + ('跳读开发时间线' if zh else 'Read the implementation') + '</summary><ol>' + chapter_links + '</ol></details>'
    out.append(contents)
    sections = 0
    paragraphs = 0
    figures = 0
    for line in lines[3:]:
        line = line.strip()
        if not line:
            continue
        if line.startswith(("[English edition]", "[中文手记]")):
            break
        if line.startswith("## "):
            stamp, heading = line[3:].split(" · ", 1)
            if sections:
                close_section(sections-1)
            out.append(f'<section id="{slugs[sections]}-{language}"><header class="chapter"><p>{escape(stamp)}</p><h2>{escape(heading)}</h2></header>')
            sections += 1
        elif line == "[[studio-capital-ledger]]":
            out.append(capital_ledger(language))
        elif line.startswith("!["):
            caption = re.match(r"!\[([^\]]+)\]", line).group(1)
            out.append(plate(["studio", "meeting", "office"][figures], language, caption))
            figures += 1
        else:
            cls = ' class="lead"' if paragraphs == 0 else ""
            out.append(f"<p{cls}>{inline(line, language)}</p>")
            paragraphs += 1
            if line.startswith(("Those 589 successful sends", "589 次确认成功")):
                teams = ["生产接入 / 发布验收", "投委会 / 部署检验", "独立 QA / Maya 语音"] if zh else ["Production access / Release review", "Committee / Deployment verification", "Independent QA / Maya voice"]
                cap = "三个岗位组合之间的直接发送次数" if zh else "Direct messages between three pairs of colleagues"
                rows = "".join(f'<li><span>{escape(label)}</span><span class="track" aria-hidden="true"><i class="length-{count}"></i></span><strong>{count}</strong></li>' for label,count in zip(teams,[40,33,27]))
                out.append(f'<figure class="team-chart"><figcaption>{cap}</figcaption><ul>{rows}</ul></figure>')
    if sections:
        close_section(sections-1)
    if not zh:
        out.append('<aside id="engineering-en"><h2>Follow the implementation</h2><p>Data readers and timestamps feed bounded specialist calls. The manager proposal then passes independent execution checks. The watch worker saves observations and requests for review in its own journal.</p><a href="#sources-en">Data sources</a> · <a href="#committee-en">Agent coordination</a> · <a href="#execution-en">Execution</a> · <a href="#watch-worker-en">Background work</a></aside><aside id="checks-en"><h2>Try the public flow</h2><p>Start with the suggested paper team, reopen its office and inspect the saved work. The custom-team blueprint failure and the limits of the historical studies are recorded in the final section.</p><a href="/?lang=en-US">Open Fund Edition ↗</a></aside></div></article>')
        return "\n".join(out)
    if zh:
        out.append('<aside id="engineering-zh"><h2>复现那笔交易</h2><p>打开九月会议，先找经理建议，再找独立成交回执，核对日期、股数和费用。切到第三场，展开经理原话以及旁边的独立校注。</p><a href="/funds?id=buffett&amp;decision=buffett-review-4&amp;lang=zh-CN">查看九月的会议与成交 ↗</a></aside><aside id="checks-zh"><h2>正式站的三份回执</h2><p>11 月 18 日，新的中文访客用 390 像素宽的浏览器问 Maya，组建三人团队，再问 Jules。独立访客询问巴菲特风格经理为何只配 20%；返回的回答引用三条当期依据。重启服务后，同一个请求返回原回执。</p>')
    else:
        out.append('<aside id="engineering-en"><h2>Reproduce the purchase</h2><p>Open the September meeting. Compare the manager’s target with the independently dated fill, share count and fee. Switch to the third meeting and read the original managerial judgment alongside the accounting correction.</p><a href="/funds?id=buffett&amp;decision=buffett-review-4&amp;lang=en-US">Inspect the meeting and fill ↗</a></aside><aside id="checks-en"><h2>Three receipts from production</h2><p>On November 18 a fresh Chinese-language visitor used a 390-pixel browser to ask Maya a question, form a team of three and question Jules. Independently, another visitor asked why the Buffett-style manager chose 20%. The answer cited three contemporary records. Repeating that request after restarting the service returned its original receipt.</p>')
    labels = ["Maya", "Jules", "历史会议" if zh else "Historical meeting"]
    receipts = ["resp_b753262d357243a196f50d82def745fb", "resp_8eeaeee6f7964871a2ccb92ba1f48684", "resp_1d8f67485e2b4f62a44dc03baafed5a6"]
    out.append("<dl>" + "".join(f"<dt>{n}</dt><dd><code>{v}</code></dd>" for n, v in zip(labels, receipts)) + "</dl></aside></div></article>")
    return "\n".join(out)


shell = '''<!doctype html>
<html lang="en-US" data-identity="signature"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#f7f9fc"><meta name="description" content="How a two-person project team built Fund Edition with AI collaborators, from its first simulated trade to a public release."><title>Fund Edition · Build journal / 开发手记</title><link rel="icon" href="/assets/signature-mark.svg"><link rel="stylesheet" href="/build-log.css"><script defer src="/build-log.mjs" type="module"></script></head><body><nav aria-label="Fund Edition"><a class="brand" href="/"><img width="29" height="29" src="/assets/signature-mark.svg" alt=""><span>Fund Edition</span></a><span class="language"><a href="?lang=en-US#en" lang="en-US" hreflang="en-US">English</a><a href="?lang=zh-CN#zh" lang="zh-CN" hreflang="zh-CN">中文</a></span></nav><main>'''
(web / "build-log.html").write_text(shell + article("en") + article("zh") + "</main></body></html>\n", encoding="utf-8")
