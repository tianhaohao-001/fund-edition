# How Fund Edition's AI teams and paper-trading system work

*Implementation notes from November 17–19, 2026 · The Big Hack Game*

Fund Edition is an AI investment-team product. One entrance lets a user build a fund with Maya, hire specialists and give them jobs in ordinary language. The other offers teams based on popular active-fund strategies and publicly described investor approaches. Both connect to a personal paper portfolio.

The founder wanted a team that keeps working between visits and can explain its decisions. Sharing a strategy's core research across users is also our route toward lower management fees. Personal teams use a trial and membership model, priced at $9.99 for a month or $99.99 for a year. Those goals led to some fairly concrete engineering requirements. We needed dated evidence, separate account books, persistent background work and a way to tell whether an AI opinion ever became an order.

This is how the current implementation fits together, including its limits. We're a two-person project team. AI agents helped implement and review the code. The investment agents described below are the roles running inside the product. [Open the app](https://fund-edition-web-production.up.railway.app/?lang=en-US)

## 1. System layout · Following one decision through the application

The application server is Node.js, with SQLite for accounts, saved work and receipts. The browser talks to product APIs. The server gathers the evidence, selects the relevant team and sends bounded requests through HarnessRouter. A manager's proposal then goes to separate execution code.

The path is `source → dated evidence → specialist reviews → manager proposal → policy checks → simulated fill or rejection → saved receipt`. A conversation can stop before the proposal. A proposal can stop at a policy check. A background observation can finish with no order. We preserve those outcomes so Maya can describe what actually happened.

We have several explicit execution modes. The Studio replay uses fixed synthetic scenarios. Historical studies use frozen datasets and their declared trading rules. A separately configured operator console has an Alpaca adapter. The public demo's paper balances are internal simulation records. Each mode needs its own source and execution labels.

## 2. Data sources · What the code reads

The background watch worker reads supported stock and ETF observations from Nasdaq's public quote interface. It obtains symbol-specific headlines from Nasdaq RSS feeds and macro headlines from the Federal Reserve press-release RSS feed. It stores headline titles, links, publishers and publication times. A saved headline doesn't establish that the model read the full article.

Fund reference data is another path. `core/market-freshness.mjs` reads Nasdaq historical closing records and Vanguard's published NAV fields for supported funds and ETFs. These records retain the provider and whether the value is an exchange close or an issuer NAV. A ticker appearing in several views doesn't make those values interchangeable.

Historical inputs are frozen separately. The ARKK holdings experiment transcribes five positions from three SEC N-PORT filings and records both report dates and a conservative availability time. The Buffett-style experiment uses a saved set of filings, derived financial facts and historical price bars. The Wellington proxy uses issuer return series with distributions reinvested. Its rebased research units have their own pricing rules.

The Alpaca adapter can retrieve configured IEX, SIP or delayed-SIP snapshots in the separate local setup. The public demo disables that operator API. The public watch implementation currently uses its own Nasdaq and RSS readers, and reference observations carry `executionEligible: false`. [Reference-data notes](https://fund-edition-web-production.up.railway.app/build-log.html?lang=en-US#data-validation-en)

## 3. Data validation · Deciding what an observation can support

We retain the source time and the time our server retrieved a record. The market calendar uses America/New_York, including the implemented holidays and early closes. A record can be current, delayed, dated, stale or unavailable. If a refresh fails, the code can retain the old observation with its status instead of stamping it as new.

For watch feeds, `core/watch-sources.mjs` rejects invalid or future publication times, restricts links to the expected HTTPS host and excludes headlines older than seven days. Requests have timeouts and byte limits. Quote parsing checks the requested symbol, positive price and timestamp. A supported reference close can be used as a labelled fallback.

Historical availability has another meaning. A July 31 holdings report may become public in September. Our study stores those times separately so a July decision can't silently consume the later filing. Restricting the supplied packet still leaves model-pretraining uncertainty, which we state in the historical experiments.

The watch list is deliberately bounded. It selects supported symbols from the actual holdings, allowed list and mandate, with a benchmark fallback. The current worker observes up to four symbols and records uncovered ones. Its eight-minute quote cache and thirty-minute news cache reduce repeated source requests. These limits belong in the product's coverage statement.

## 4. Team configuration · Turning a job description into a task

Each colleague has a stable identity, professional `role`, editable title, written `duty` and current `desk`. The fund stores its mandate, confirmed roster, permissions and position cap. Hiring validates the allowed role types, distinct names and fields. The current limit is 24 members including the manager.

The backend derives `assignmentRole` from the current desk. At a research desk, a research specialist tests the thesis and a quant specialist handles construction. At risk, the assignment is exposure and downside. At execution, it is quote and fill eligibility. A bench assignment makes the specialist inactive for that review.

This distinction came from a real bug. Dragging Theo saved his new seat, but the next model input still asked him for his previous task. We fixed the input routing. His research specialty and written brief remain available alongside the new assignment. Moving a portrait grants no order authority.

Maya is the main contact. A direct colleague question is routed with the selected fund and member, the relevant mandate and ledger evidence, and that member's recent conversation. The current prompt includes the last ten messages for the selected seat. Switching colleagues or funds has to preserve that scope.

## 5. Team coordination · Parallel opinions followed by a manager

The role is implemented through an explicit task, supplied evidence, an output schema and a recorded model call. Research looks for support and counterevidence. Risk challenges exposure, assumptions and permissions. Portfolio construction considers sizing against cash. Execution checks the supplied quote conditions. The manager synthesizes the actual returned opinions.

In the Studio synthetic committee, `selectCommittee` chooses one active specialist per supported discipline. The specialist requests run with `Promise.all`. Each receives the same evidence snapshot and their current assignment. The manager is called after those opinions return. An opinion includes `sentiment`, `summary`, `reconsider` and `evidenceRefs`. Code checks the allowed values, lengths and evidence IDs.

The catalogue's historical-review path uses research and risk in parallel, followed by a manager. Their briefs come from the selected strategy's research method. A failed seat remains failed in the receipt. If both specialists fail, manager synthesis is skipped. A retry can reuse completed specialist replies when the evidence signature is unchanged.

The prospective fund-operation path also uses research, independent risk and a manager. The first implemented allocation path is Wellington's constrained equity-and-credit sleeve universe. Each catalogue method has its own supported scope and missing inputs. We don't infer that every listed strategy has a fully reproduced trading team.

The activity stream records started, completed, failed, skipped and handoff events, together with response IDs and cited evidence. These are explicit handoffs through the coordinator. A specialist cannot be credited with work merely because its portrait is in the office.

## 6. Trading engine · Checking a proposal before touching cash

The replay engine returns a versioned `fundroom.decision.v1` record. It includes the evidence, reviews, decision, policy checks, execution result and portfolio before and after. This gives the browser and manager one record to discuss.

The manager supplies a supported action, symbol and target weight. Independent code verifies the proposal shape, the permitted ticker, buy or sell permission, mandate restrictions, the effective position cap, session state and a valid bid/ask. Replay quotes must also pass the scenario-relative 60-second age check.

Only then does the engine calculate quantity and post-order exposure. It uses integer cents for money and integer arithmetic for the cap calculation, including the effect of the spread on the portfolio's value. Replay buys use the ask and sells use the bid. A cash shortfall, negative remaining position or excess exposure produces a blocked result. A hold records the decision without a fill.

Each historical engine states its own assumptions. The Buffett experiment decides from the frozen packet and simulates execution at the next subsequent session's open, with its declared fee and fractional-share precision. The Wellington historical allocation uses total-return index units. Those aren't live ETF orders.

The local Alpaca console separately previews and explicitly confirms a broker order, using its own credentials, clock, quote and account checks. Real brokerage connectivity and live fills remain outside the public demo's verified scope.

## 7. Account storage · Making retries safe

SQLite stores visitor workspaces, account ownership and decision receipts. The store enables WAL, foreign keys and a busy timeout. Receipt keys include the owner and request ID, with a signature of the intended action. Repeating a completed request returns its stored result. Reusing the ID for a different action is rejected.

Portfolio funding needs the same care as a trade. A new account starts with $100,000 in paper capital. Confirming the first self-built fund transfers available wallet cash into fund units atomically. Separate contributions increase contributed capital. They don't count as profit. The personal portfolio values the user's units against the corresponding fund book.

Our concurrency check ran two server processes against the first-fund confirmation and got one subscription. Other checks replayed capital claims and allocation actions. A single successful click wouldn't tell us what happened after a timeout, refresh or retry.

## 8. Scheduling · Keeping work on the server

The worker lives in the application server, so closing a browser doesn't cancel its scheduled jobs. `core/watch-clock.mjs` calculates a morning news slot at 08:30 New York time and market observations from the regular open at supported 30-, 60- or 120-minute intervals. It accounts for the implemented holiday and early-close calendar.

Jobs and runs are persisted in SQLite, keyed by owner, fund and time slot. A timer wakes the worker for the next due job. Claiming work runs inside `BEGIN IMMEDIATE`, so competing workers can't both insert the same run. The next scheduled slot is also persisted.

Restart recovery marks old in-progress work interrupted. An expired scheduled slot is recorded as missed. A still-timely observation can run within the implemented grace window. We preserve that gap instead of presenting a newly created record as if the service had watched throughout an outage.

The broader product goal is a team available around the clock. This implementation provides scheduled US-equity observations. It doesn't establish tick-level coverage or continuous trading in every market.

## 9. Watch cycle · When the worker calls an AI

A cycle derives the watch list, reads prices and feeds, and compares them with prior usable observations. It deduplicates news URLs and compares prices only when the provider and quote kind match. Missing evidence produces a visible state.

The initial rules flag a move of at least 2%, or relevant new headlines, for review. An unchanged same-day packet can skip inference. The worker also checks membership access and a separate background-model budget. A scheduled wake-up therefore doesn't imply a new model request on every pass.

When it calls Maya, it passes the mandate, holdings, permissions, changes and timestamped facts labelled with IDs such as Q1 and N1. The model returns one of `MONITOR`, `MAINTAIN` or `REQUEST_PAPER_REVIEW`, an explanation and references to supplied facts. The backend validates those references and saves the model receipt.

The saved watch record includes the source packet, signals, rule, AI status and completion time. Its execution field is `no-order` with the reason `reference-only`. A request for review is a recorded follow-up. A separate decision and execution path owns any proposed order. This is the current boundary between background monitoring and trading.

## 10. Costs and failures · What we share and what remains per user

The source cache and in-flight request reuse let several observations share a source fetch. Model calls have their own budget reservations. An unavailable provider, exhausted budget, expired membership or lack of usable evidence produces an explicit status. We retain recent watch history so the returning owner can inspect what completed.

Our commercial hypothesis is that a strategy's core research can serve many investors. The existing shared-proposal experiment distributes one proposal to isolated account books. Personal conversations and account-specific processing still cost money. The current watch manager receives each fund's own mandate and holdings, so we can't claim all background inference is already shared.

We separate these costs when evaluating the $9.99 monthly or $99.99 annual membership and a future low-management-fee strategy service. We need real usage, data and operating costs before claiming the economics work at scale.

## 11. Deployment · What made the public link fail

The public greeting worked while new questions failed. HarnessRouter declined the hosted intermediary route, and the deployment package also contained an older studio. Frontend, backend and release traced the screen and the provider path separately. We moved the application onto a direct Railway server with persistent storage.

Railway then rejected our Dockerfile's VOLUME declaration because the platform already managed the mount. Removing that line got the frozen package running. We kept a separate office redesign out of that deployment so the fix had a clear scope.

Acceptance hired a colleague through the public site, asked a fresh question, restarted the service and reopened the same visitor. We checked the retained team and replies. Later changes were shipped against a frozen file manifest. This caught the difference between code in the shared workspace and code actually serving the public URL.

## 12. Development workflow · How a different agent caught our mistakes

We divided development by owned components, with an independent reviewer able to return a feature. New agents inherited the conversation at spawn time. Later decisions needed direct messages and shared handoff records. We coordinated ownership before changing shared routes and contracts.

The audited November 18 record counted 45 agents across successive groups and 589 confirmed peer sends. Committee implementation and deployment verification exchanged 33 messages. These are cumulative collaboration records. Their value showed up when a recipient found a mismatched interface or challenged an acceptance claim.

An evidence reviewer caught a cash-flow reclassification before it entered a historical packet. Another caught the manager's incorrect bound interpretation. A faster model candidate described a total-return benchmark as a price return and was rejected. A mobile reviewer found a help bar moving the target desk by about 82 pixels. Each case produced a concrete input, an observed failure and a retest.

## 13. Current limits · The next checks we need

A fresh custom-team request failed to return a usable blueprint during the final demo recording. The suggested starter-team flow completed, and that's the flow shown in the submitted video. We haven't marked the failed custom setup fixed.

The public ARKK manager did answer a separate real question. Given the July 2025 disclosed Tesla weight of 9.81% and a hypothetical $1,000, it calculated $98.10 of Tesla exposure and explained the limitations of the filing. The recording shortens waiting time. This verifies that conversation, while the custom-team failure remains a different path to repair.

Other limits include the watch symbol cap, source availability, periodic observation intervals, model budgets and the historical studies' coverage. A valid evidence ID doesn't prove an interpretation is correct. Physical iPhone voice input, real broker fills and the shared strategy's production unit economics still need their own verification.

The next end-to-end check starts with a new visitor and a new mandate. It follows the selected roster into the model request, checks the saved funding receipt, closes the browser, inspects the next background run and asks Maya to explain that exact record. That's the chain we want a user to be able to trust. [Product and demo](https://community.harnessrouter.ai/p/fund-edition)

[Source code](https://github.com/tianhaohao-001/fund-edition) · [Data reader](https://github.com/tianhaohao-001/fund-edition/blob/main/core/watch-sources.mjs) · [Committee](https://github.com/tianhaohao-001/fund-edition/blob/main/core/committee.mjs) · [Execution engine](https://github.com/tianhaohao-001/fund-edition/blob/main/core/engine.mjs) · [Watch worker](https://github.com/tianhaohao-001/fund-edition/blob/main/core/watch-worker.mjs)

[中文手记](zh-CN.md) · [Forum version and publication record](forum.md) · [Source evidence](evidence.md)
