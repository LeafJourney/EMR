# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: commercial-conversion.spec.ts >> Commercial conversion smoke — pass 9 >> landing → marketplace → product detail renders
- Location: e2e/commercial-conversion.spec.ts:108:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator:  locator('header a[href="/marketplace"]').first()
Expected: visible
Received: hidden
Timeout:  5000ms

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('header a[href="/marketplace"]').first()
    9 × locator resolved to <a href="/marketplace" class="flex flex-col items-center justify-center gap-1 rounded-xl bg-surface border border-border/60 px-2 py-3 hover:bg-surface-muted hover:border-accent/40 transition-all">…</a>
      - unexpected value "hidden"

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - link "Skip to content" [ref=e2] [cursor=pointer]:
    - /url: "#main-content"
  - generic [ref=e3]:
    - banner [ref=e4]:
      - generic [ref=e5]:
        - link "Leafjourney home" [ref=e6] [cursor=pointer]:
          - /url: /
          - generic [ref=e7]:
            - img [ref=e8]
            - generic [ref=e12]:
              - generic [ref=e13]: Leafjourney
              - generic [ref=e14]: health
        - navigation "Main" [ref=e15]:
          - link "About" [ref=e16] [cursor=pointer]:
            - /url: /about
          - link "Security" [ref=e17] [cursor=pointer]:
            - /url: /security
          - link "Education" [ref=e18] [cursor=pointer]:
            - /url: /education
          - link "LeafMart" [ref=e19] [cursor=pointer]:
            - /url: https://www.theleafmart.com/
          - link "Marketplace" [ref=e20] [cursor=pointer]:
            - /url: https://www.theleafmart.com/
          - link "Developer" [ref=e21] [cursor=pointer]:
            - /url: /developer
          - link "Sign in" [ref=e22] [cursor=pointer]:
            - /url: /sign-in
        - link "Demo" [ref=e23] [cursor=pointer]:
          - /url: /sign-up
          - button "Demo" [ref=e24]
    - main [ref=e25]:
      - generic [ref=e27]:
        - generic [ref=e28]:
          - paragraph [ref=e29]:
            - img [ref=e30]
            - text: AI-native cannabis care platform
          - heading "The EMR that thinks with you." [level=1] [ref=e33]:
            - text: The EMR that thinks
            - text: with you.
          - paragraph [ref=e34]:
            - text: "A fleet of 13 AI agents reviews the chart, drafts the note, checks for drug interactions, and surfaces the research — so clinicians can spend their time on what actually matters:"
            - strong [ref=e35]: the patient in front of them
            - text: .
          - generic [ref=e36]:
            - link "Request a demo" [ref=e37] [cursor=pointer]:
              - /url: /sign-up
              - button "Request a demo" [ref=e38]
            - link "See our story" [ref=e39] [cursor=pointer]:
              - /url: /about
              - button "See our story" [ref=e40]
          - generic [ref=e41]:
            - generic [ref=e42]:
              - paragraph [ref=e43]: "13"
              - paragraph [ref=e44]: AI agents
            - generic [ref=e45]:
              - paragraph [ref=e46]: 50+
              - paragraph [ref=e47]: Studies indexed
            - generic [ref=e48]:
              - paragraph [ref=e49]: "43"
              - paragraph [ref=e50]: Interactions
            - generic [ref=e51]:
              - paragraph [ref=e52]: HIPAA
              - paragraph [ref=e53]: Ready
        - generic [ref=e55]:
          - generic [ref=e56]:
            - generic [ref=e57]:
              - generic [ref=e58]:
                - img [ref=e61]
                - generic [ref=e63]:
                  - paragraph [ref=e64]: Pre-Visit Intelligence
                  - paragraph [ref=e65]: agent · v1.0
              - generic [ref=e70]: Ready
            - generic [ref=e72]:
              - generic [ref=e73]:
                - img [ref=e76]
                - generic [ref=e78]:
                  - generic [ref=e79]: Patient profile
                  - generic [ref=e80]: ✓
              - generic [ref=e81]:
                - img [ref=e84]
                - generic [ref=e86]:
                  - generic [ref=e87]: Recent encounters
                  - generic [ref=e88]: ✓
              - generic [ref=e89]:
                - img [ref=e92]
                - generic [ref=e94]:
                  - generic [ref=e95]: Outcome trends
                  - generic [ref=e96]: ✓
              - generic [ref=e97]:
                - img [ref=e100]
                - generic [ref=e102]:
                  - generic [ref=e103]: Medication adherence
                  - generic [ref=e104]: ✓
              - generic [ref=e105]:
                - img [ref=e108]
                - generic [ref=e110]:
                  - generic [ref=e111]: Messages & assessments
                  - generic [ref=e112]: ✓
              - generic [ref=e113]:
                - img [ref=e116]
                - generic [ref=e118]:
                  - generic [ref=e119]: Intelligence synthesis
                  - generic [ref=e120]: ✓
            - generic [ref=e121]:
              - generic [ref=e122]:
                - generic [ref=e123]: Briefing ready
                - generic [ref=e124]: 2.3s · 94% confidence
              - generic [ref=e125]:
                - generic [ref=e126]:
                  - generic [ref=e127]: Pain trend
                  - generic [ref=e128]: ↓ 40%
                - generic [ref=e129]:
                  - generic [ref=e130]: Sleep quality
                  - generic [ref=e131]: improving
                - generic [ref=e132]:
                  - generic [ref=e133]: Adherence
                  - generic [ref=e134]: 92%
                - generic [ref=e135]:
                  - generic [ref=e136]: Risk flags
                  - generic [ref=e137]: "1"
          - generic [ref=e138]:
            - generic [ref=e139]: 2.3s
            - generic [ref=e140]: briefing
          - generic [ref=e143]: Claude 4.5
      - img [ref=e147]
      - generic [ref=e154]:
        - paragraph [ref=e155]:
          - img [ref=e156]
          - text: The problem we couldn't ignore
        - heading "Physicians spend 2 hours on their EMR for every 1 hour with a patient." [level=2] [ref=e159]:
          - text: Physicians spend 2 hours on their EMR
          - text: for every 1 hour with a patient.
        - paragraph [ref=e160]: Chart review before visits. Documentation after. Billing codes. Refill requests. Message triage. The tools that were supposed to save time became the biggest thief of it.
        - paragraph [ref=e161]: We built the EMR that gives that time back.
      - generic [ref=e162]:
        - generic [ref=e164]:
          - paragraph [ref=e165]:
            - img [ref=e166]
            - text: The new physician workflow
          - heading "From 25 minutes to 3 minutes." [level=2] [ref=e169]
          - paragraph [ref=e170]: One click, four steps. The entire pre-visit and documentation workflow, re-imagined around AI agents that actually do the work.
        - generic [ref=e173]:
          - generic [ref=e175]:
            - generic [ref=e176]:
              - generic [ref=e177]: "1"
              - generic [ref=e178]: ~30s
            - img [ref=e180]
            - heading "Prepare" [level=3] [ref=e188]
            - paragraph [ref=e189]: AI agent pulls the chart, analyzes trends, surfaces risks — 2.3 seconds.
          - generic [ref=e191]:
            - generic [ref=e192]:
              - generic [ref=e193]: "2"
              - generic [ref=e194]: ~1 click
            - img [ref=e196]
            - heading "Start visit" [level=3] [ref=e198]
            - paragraph [ref=e199]: One click. Briefing flows into the scribe. Note is pre-seeded with talking points.
          - generic [ref=e201]:
            - generic [ref=e202]:
              - generic [ref=e203]: "3"
              - generic [ref=e204]: ~1 min
            - img [ref=e206]
            - heading "Refine" [level=3] [ref=e211]
            - paragraph [ref=e212]: "Inline AI editor per section: expand, clarify, add dosing, make it more clinical."
          - generic [ref=e214]:
            - generic [ref=e215]:
              - generic [ref=e216]: "4"
              - generic [ref=e217]: ~1 click
            - img [ref=e219]
            - heading "Sign" [level=3] [ref=e222]
            - paragraph [ref=e223]: Coding agent suggests ICD-10 + E&M. Physician signs. Done.
      - img [ref=e227]
      - generic [ref=e232]:
        - generic [ref=e234]:
          - paragraph [ref=e235]:
            - img [ref=e236]
            - text: Meet the fleet
          - heading "Thirteen agents, one platform." [level=2] [ref=e239]
          - paragraph [ref=e240]: Every workflow in Leafjourney is backed by a specialized AI agent — not a single chatbot, but a fleet of experts working together, with humans always in the loop.
        - generic [ref=e241]:
          - generic [ref=e243]:
            - generic [ref=e244]:
              - img [ref=e246]
              - generic [ref=e254]:
                - generic [ref=e255]: Flagship
                - generic [ref=e257]: "#01"
            - heading "Pre-Visit Intelligence" [level=3] [ref=e258]
            - paragraph [ref=e259]: Synthesizes chart data, trends, and research into a briefing before every visit.
          - generic [ref=e261]:
            - generic [ref=e262]:
              - img [ref=e264]
              - generic [ref=e269]:
                - generic [ref=e270]: Flagship
                - generic [ref=e272]: "#02"
            - heading "Scribe" [level=3] [ref=e273]
            - paragraph [ref=e274]: Drafts structured APSO visit notes from encounter context, pre-seeded by the briefing.
          - generic [ref=e276]:
            - generic [ref=e277]:
              - img [ref=e279]
              - generic [ref=e285]: "#03"
            - heading "Coding Readiness" [level=3] [ref=e286]
            - paragraph [ref=e287]: Generates ICD-10 codes, E&M levels, and cannabis-specific coding suggestions.
          - generic [ref=e289]:
            - generic [ref=e290]:
              - img [ref=e292]
              - generic [ref=e296]: "#04"
            - heading "Research Synthesizer" [level=3] [ref=e297]
            - paragraph [ref=e298]: Searches 50+ peer-reviewed studies, returns evidence at the point of care.
          - generic [ref=e300]:
            - generic [ref=e301]:
              - img [ref=e303]
              - generic [ref=e308]: "#05"
            - heading "Dosing Recommender" [level=3] [ref=e309]
            - paragraph [ref=e310]: Suggests cannabinoid ratios and starting doses based on the research corpus.
          - generic [ref=e312]:
            - generic [ref=e313]:
              - img [ref=e315]
              - generic [ref=e320]: "#06"
            - heading "Document Organizer" [level=3] [ref=e321]
            - paragraph [ref=e322]: Classifies, tags, and files uploaded documents into the right chart section.
          - generic [ref=e324]:
            - generic [ref=e325]:
              - img [ref=e327]
              - generic [ref=e331]: "#07"
            - heading "Outcome Tracker" [level=3] [ref=e332]
            - paragraph [ref=e333]: Detects trends in patient check-ins and flags worsening scores for physician review.
          - generic [ref=e335]:
            - generic [ref=e336]:
              - img [ref=e338]
              - generic [ref=e342]: "#08"
            - heading "Messaging Assistant" [level=3] [ref=e343]
            - paragraph [ref=e344]: Drafts personalized patient replies — always approval-gated by the clinician.
          - generic [ref=e346]:
            - generic [ref=e347]:
              - img [ref=e349]
              - generic [ref=e353]: "#09"
            - heading "Patient Outreach" [level=3] [ref=e354]
            - paragraph [ref=e355]: Generates follow-up messages after encounters with context from the visit.
          - generic [ref=e357]:
            - generic [ref=e358]:
              - img [ref=e360]
              - generic [ref=e365]: "#10"
            - heading "Physician Nudge" [level=3] [ref=e366]
            - paragraph [ref=e367]: Creates follow-up tasks and reminders based on note content and patient state.
          - generic [ref=e369]:
            - generic [ref=e370]:
              - img [ref=e372]
              - generic [ref=e376]: "#11"
            - heading "Scheduling" [level=3] [ref=e377]
            - paragraph [ref=e378]: Auto-creates reminder workflows 7, 2, and 1 day before upcoming appointments.
          - generic [ref=e380]:
            - generic [ref=e381]:
              - img [ref=e383]
              - generic [ref=e389]: "#12"
            - heading "Practice Launch" [level=3] [ref=e390]
            - paragraph [ref=e391]: Guides operators through the practice setup checklist with AI validation.
          - generic [ref=e393]:
            - generic [ref=e394]:
              - img [ref=e396]
              - generic [ref=e401]: "#13"
            - heading "Intake" [level=3] [ref=e402]
            - paragraph [ref=e403]: Structures patient intake answers into actionable chart data and follow-up tasks.
      - img [ref=e407]
      - generic [ref=e412]:
        - generic [ref=e414]:
          - paragraph [ref=e415]:
            - img [ref=e416]
            - text: Built for three people
          - heading "Clinician. Patient. Operator." [level=2] [ref=e419]
          - paragraph [ref=e420]: Every role in a practice has different needs. We built three purpose-designed experiences that share one data model — so the story stays whole.
        - generic [ref=e421]:
          - generic [ref=e424]:
            - img [ref=e426]
            - paragraph [ref=e430]: For clinicians
            - heading "Stop charting. Start caring." [level=3] [ref=e431]
            - paragraph [ref=e432]: Mission Control dashboard. AI scribe. Pre-visit briefings. Inline note refinement. Built so you actually look forward to opening your EMR.
            - list [ref=e433]:
              - listitem [ref=e434]:
                - img [ref=e435]
                - text: Pre-Visit Intelligence Agent
              - listitem [ref=e438]:
                - img [ref=e439]
                - text: AI scribe with inline refinement
              - listitem [ref=e442]:
                - img [ref=e443]
                - text: Cannabis Combo Wheel (pharmacology tool)
              - listitem [ref=e446]:
                - img [ref=e447]
                - text: Research Console (50+ studies)
              - listitem [ref=e450]:
                - img [ref=e451]
                - text: Drug interaction checker (43 interactions)
              - listitem [ref=e454]:
                - img [ref=e455]
                - text: Physician-to-physician secure messaging
          - generic [ref=e460]:
            - img [ref=e462]
            - paragraph [ref=e465]: For patients
            - heading "Your medical story, kept close." [level=3] [ref=e466]
            - paragraph [ref=e467]: Not a patient portal. A patient journey. My Story ebook, My Garden companion, lifestyle care plan, outcome tracking — warm, human, yours.
            - list [ref=e468]:
              - listitem [ref=e469]:
                - img [ref=e470]
                - text: My Story printable ebook
              - listitem [ref=e473]:
                - img [ref=e474]
                - text: My Garden plant companion
              - listitem [ref=e477]:
                - img [ref=e478]
                - text: Lifestyle care plan (7 domains)
              - listitem [ref=e481]:
                - img [ref=e482]
                - text: Outcome check-ins with trends
              - listitem [ref=e485]:
                - img [ref=e486]
                - text: Secure messaging with your team
              - listitem [ref=e489]:
                - img [ref=e490]
                - text: Plain-language explanations
          - generic [ref=e495]:
            - img [ref=e497]
            - paragraph [ref=e500]: For operators
            - heading "A practice that runs itself." [level=3] [ref=e501]
            - paragraph [ref=e502]: Mission control analytics, practice launch checklist, patient roster, insurance eligibility, billing worksheets. The ops layer that closes the loop.
            - list [ref=e503]:
              - listitem [ref=e504]:
                - img [ref=e505]
                - text: Mission Control dashboard
              - listitem [ref=e508]:
                - img [ref=e509]
                - text: Patient roster & analytics
              - listitem [ref=e512]:
                - img [ref=e513]
                - text: Insurance eligibility checker
              - listitem [ref=e516]:
                - img [ref=e517]
                - text: Medicare CBD framework
              - listitem [ref=e520]:
                - img [ref=e521]
                - text: Billing & CPT/ICD-10 worksheets
              - listitem [ref=e524]:
                - img [ref=e525]
                - text: Practice launch checklist
      - generic [ref=e528]:
        - generic [ref=e530]:
          - paragraph [ref=e531]:
            - img [ref=e532]
            - text: Cannabis, done right
          - heading "The only EMR designed for cannabis medicine from day one." [level=2] [ref=e535]
        - generic [ref=e536]:
          - generic [ref=e538]:
            - img [ref=e540]
            - generic [ref=e542]:
              - heading "Milligram-based dosing" [level=3] [ref=e543]
              - paragraph [ref=e544]: Every prescription tracks exact mg of THC and CBD per dose, per day. Volume can change, but therapeutic dose stays consistent — so patients never guess.
          - generic [ref=e546]:
            - img [ref=e548]
            - generic [ref=e552]:
              - heading "Cannabis Combo Wheel" [level=3] [ref=e553]
              - paragraph [ref=e554]: Interactive pharmacology tool. Select cannabinoids and terpenes, see combined therapeutic profile, target symptoms, benefits, risks, and evidence strength.
          - generic [ref=e556]:
            - img [ref=e558]
            - generic [ref=e560]:
              - heading "Drug interaction checker" [level=3] [ref=e561]
              - paragraph [ref=e562]: 43 cannabis-drug interactions across red, yellow, and green severity. Real-time warnings during prescribing, acknowledged + signed before submission.
          - generic [ref=e564]:
            - img [ref=e566]
            - generic [ref=e568]:
              - heading "Research Database" [level=3] [ref=e569]
              - paragraph [ref=e570]: 50+ peer-reviewed studies indexed with structured dosing data. The Research Agent surfaces evidence at the point of care — traceable to source.
          - generic [ref=e572]:
            - img [ref=e574]
            - generic [ref=e577]:
              - heading "APSO note format" [level=3] [ref=e578]
              - paragraph [ref=e579]: Assessment → Plan → Subjective → Objective. Re-ordered for how clinicians actually think, not how legacy EMRs force them to document.
          - generic [ref=e581]:
            - img [ref=e583]
            - generic [ref=e587]:
              - heading "Dispensary-ready" [level=3] [ref=e588]
              - paragraph [ref=e589]: SKU-based product catalog, dispensary locator, pharmacy pickup notes auto-sent to patients with brand, dosing, and pickup location.
      - img [ref=e593]
      - generic [ref=e601]:
        - img [ref=e604]
        - blockquote [ref=e608]:
          - text: “This isn't MyChart. This is MyStory.
          - text: This isn't a patient's medical history.
          - text: This is a patient's medical journey.”
        - generic [ref=e609]:
          - generic [ref=e610]: NP
          - generic [ref=e611]:
            - paragraph [ref=e612]: Dr. Neal H. Patel
            - paragraph [ref=e613]: Co-Founder & CEO
      - img [ref=e617]
      - generic [ref=e623]:
        - generic [ref=e624]:
          - paragraph [ref=e625]:
            - img [ref=e626]
            - text: Proprietary tool
          - heading "The Cannabis Wellness Wheel" [level=2] [ref=e629]
          - paragraph [ref=e630]: Our signature pharmacology tool. Select cannabinoids and terpenes, see their combined therapeutic profile, evidence levels, and dosing guidance — personalized to your patient's condition.
        - generic [ref=e631]:
          - generic [ref=e632]:
            - generic [ref=e633]:
              - img [ref=e636]
              - heading "6 Cannabinoids" [level=3] [ref=e639]
              - paragraph [ref=e640]: THC, CBD, CBN, CBG, CBC, THCV — each with evidence-backed therapeutic profiles.
            - generic [ref=e641]:
              - img [ref=e644]
              - heading "8 Terpenes" [level=3] [ref=e649]
              - paragraph [ref=e650]: Myrcene, limonene, linalool, pinene, caryophyllene, and more — the aromatic compounds that shape the effect.
            - generic [ref=e651]:
              - img [ref=e654]
              - heading "10 Condition Guides" [level=3] [ref=e658]
              - paragraph [ref=e659]: Pain, insomnia, anxiety, PTSD, nausea, and more — matched to the best cannabinoid + terpene combinations.
          - generic [ref=e660]:
            - status [ref=e661]
            - generic [ref=e662]:
              - generic [ref=e664]:
                - group "Cannabis Combo Wheel — cannabinoids and terpenes" [ref=e665]:
                  - checkbox "Select THC, cannabinoid, currently unselected" [ref=e667] [cursor=pointer]:
                    - generic: THC
                  - checkbox "Select CBD, cannabinoid, currently unselected" [ref=e669] [cursor=pointer]:
                    - generic: CBD
                  - checkbox "Select CBG, cannabinoid, currently unselected" [ref=e671] [cursor=pointer]:
                    - generic: CBG
                  - checkbox "Select CBN, cannabinoid, currently unselected" [ref=e673] [cursor=pointer]:
                    - generic: CBN
                  - checkbox "Select CBC, cannabinoid, currently unselected" [ref=e675] [cursor=pointer]:
                    - generic: CBC
                  - checkbox "Select THCV, cannabinoid, currently unselected" [ref=e677] [cursor=pointer]:
                    - generic: THCV
                  - checkbox "Select CBDa, cannabinoid, currently unselected" [ref=e679] [cursor=pointer]:
                    - generic: CBDa
                  - checkbox "Select THCa, cannabinoid, currently unselected" [ref=e681] [cursor=pointer]:
                    - generic: THCa
                  - checkbox "Select Myrcene, terpene, currently unselected" [ref=e683] [cursor=pointer]:
                    - generic: Myrcene
                  - checkbox "Select Limonene, terpene, currently unselected" [ref=e685] [cursor=pointer]:
                    - generic: Limonene
                  - checkbox "Select Caryophyllene, terpene, currently unselected" [ref=e687] [cursor=pointer]:
                    - generic: Caryophyllene
                  - checkbox "Select Linalool, terpene, currently unselected" [ref=e689] [cursor=pointer]:
                    - generic: Linalool
                  - checkbox "Select Pinene, terpene, currently unselected" [ref=e691] [cursor=pointer]:
                    - generic: Pinene
                  - checkbox "Select Humulene, terpene, currently unselected" [ref=e693] [cursor=pointer]:
                    - generic: Humulene
                  - checkbox "Select Terpinolene, terpene, currently unselected" [ref=e695] [cursor=pointer]:
                    - generic: Terpinolene
                  - checkbox "Select Ocimene, terpene, currently unselected" [ref=e697] [cursor=pointer]:
                    - generic: Ocimene
                  - generic [ref=e701]:
                    - generic: Combo Wheel
                    - generic: Select compounds
                    - generic: Tap any segment
                - generic [ref=e703]:
                  - generic [ref=e704]: Cannabinoids
                  - generic [ref=e706]: Terpenes
              - generic [ref=e709]:
                - generic [ref=e710]:
                  - heading "Your Selection" [level=3] [ref=e711]:
                    - img [ref=e712]
                    - text: Your Selection
                  - paragraph [ref=e715]: Pick a starting compound — then add a second to unlock combos.
                - generic [ref=e717]:
                  - paragraph [ref=e718]: Tap any segment of the wheel to begin.
                  - paragraph [ref=e719]: Add a second compound to see the synergistic targets your combo unlocks.
          - generic [ref=e720]:
            - link "Open the full Wellness Wheel" [ref=e721] [cursor=pointer]:
              - /url: /portal/combo-wheel
              - button "Open the full Wellness Wheel" [ref=e722]
            - paragraph [ref=e723]: Free to explore — no account required.
      - img [ref=e727]
      - generic [ref=e735]:
        - paragraph [ref=e736]:
          - img [ref=e737]
          - text: The sacred plant
        - paragraph [ref=e740]: For thousands of years, the cannabis plant has been a companion to humanity — a healer, a teacher, and a quiet source of relief for those in pain. Its roots reach deep into the soil of ancient medicine, its leaves hold compounds that speak directly to the human body through the endocannabinoid system. Cannabis is not a trend. It is a sacred botanical ally with the power to ease suffering, restore balance, and open pathways to wellness that modern medicine is only beginning to understand. All who use this platform shall respect the plant and use it with intention, care, and reverence for its remarkable healing properties.
      - generic [ref=e744]:
        - paragraph [ref=e745]:
          - img [ref=e746]
          - text: Give time back to care
        - heading "Your patients are waiting. So are we." [level=2] [ref=e749]:
          - text: Your patients are waiting.
          - text: So are we.
        - paragraph [ref=e750]: Leafjourney is in active development with partner practices. If you're a clinician, an investor, or a patient who believes healthcare deserves better — we'd love to talk.
        - generic [ref=e751]:
          - link "Request a demo" [ref=e752] [cursor=pointer]:
            - /url: /sign-up
            - button "Request a demo" [ref=e753]
          - link "Meet the team" [ref=e754] [cursor=pointer]:
            - /url: /about
            - button "Meet the team" [ref=e755]
        - paragraph [ref=e756]: “Personalized cannabis care, powered by heart and soul.”
    - contentinfo [ref=e757]:
      - generic [ref=e758]:
        - generic [ref=e759]:
          - generic [ref=e760]:
            - generic [ref=e761]:
              - img [ref=e762]
              - generic [ref=e766]:
                - generic [ref=e767]: Leafjourney
                - generic [ref=e768]: health
            - paragraph [ref=e769]: An AI-native cannabis care platform. Patient portal, clinician workspace, and practice operations — unified.
          - generic [ref=e770]:
            - heading "Stay in the loop" [level=3] [ref=e771]
            - paragraph [ref=e772]: New features, research highlights, and the occasional field note from the team. No filler.
            - generic [ref=e773]:
              - generic [ref=e774]: Email address
              - textbox "Email address" [ref=e775]:
                - /placeholder: you@email.com
              - button "Join" [ref=e776] [cursor=pointer]
        - generic [ref=e777]:
          - generic [ref=e778]:
            - button "Product":
              - generic: Product
            - list [ref=e779]:
              - listitem [ref=e780]:
                - link "Patient Portal" [ref=e781] [cursor=pointer]:
                  - /url: /sign-up
              - listitem [ref=e782]:
                - link "Clinician Portal" [ref=e783] [cursor=pointer]:
                  - /url: /sign-up
              - listitem [ref=e784]: Operator Dashboard
              - listitem [ref=e785]:
                - link "The LeafMart" [ref=e786] [cursor=pointer]:
                  - /url: https://www.theleafmart.com/
          - generic [ref=e787]:
            - button "Company":
              - generic: Company
            - list [ref=e788]:
              - listitem [ref=e789]:
                - link "About" [ref=e790] [cursor=pointer]:
                  - /url: /about
              - listitem [ref=e791]:
                - link "Security" [ref=e792] [cursor=pointer]:
                  - /url: /security
              - listitem [ref=e793]:
                - link "Careers" [ref=e794] [cursor=pointer]:
                  - /url: /contact
              - listitem [ref=e795]: Press
          - generic [ref=e796]:
            - button "Resources":
              - generic: Resources
            - list [ref=e797]:
              - listitem [ref=e798]:
                - link "Education" [ref=e799] [cursor=pointer]:
                  - /url: /education
              - listitem [ref=e800]:
                - link "Developer" [ref=e801] [cursor=pointer]:
                  - /url: /developer
              - listitem [ref=e802]:
                - link "Status" [ref=e803] [cursor=pointer]:
                  - /url: /status
              - listitem [ref=e804]: Blog
          - generic [ref=e805]:
            - button "Legal":
              - generic: Legal
            - list [ref=e806]:
              - listitem [ref=e807]:
                - link "Privacy" [ref=e808] [cursor=pointer]:
                  - /url: /security#privacy
              - listitem [ref=e809]:
                - link "Terms" [ref=e810] [cursor=pointer]:
                  - /url: /legal/terms
              - listitem [ref=e811]:
                - link "HIPAA" [ref=e812] [cursor=pointer]:
                  - /url: /security#hipaa
        - paragraph [ref=e813]: Cannabis should be considered a medicine — please use it carefully and judiciously. Do not abuse cannabis, and respect the plant and its healing properties. Leafjourney is a demonstration product and is not a substitute for medical advice. All educational material on this website is strictly for that — education. Any and all changes to medications or treatment plans must be discussed with your healthcare provider first.
        - generic [ref=e814]:
          - generic [ref=e815]:
            - generic [ref=e816]: © 2026 Leafjourney Health.
            - button "Back to top" [ref=e817] [cursor=pointer]:
              - generic [ref=e818]: ↑
              - text: Back to top
          - generic [ref=e819]:
            - generic [ref=e820]: Hemp-derived products ship nationally where permitted.
            - generic [ref=e821]: Licensed cannabis available intrastate only.
  - button "Send feedback" [ref=e822] [cursor=pointer]:
    - generic [ref=e823]: 🌱
  - alert [ref=e824]
  - generic [ref=e825]:
    - generic [ref=e826]:
      - heading "We value your privacy" [level=3] [ref=e827]
      - paragraph [ref=e828]: We use cookies to enhance your browsing experience, serve personalized content, and analyze our traffic. By clicking "Accept All", you consent to our use of cookies as outlined in our Privacy Policy.
    - generic [ref=e829]:
      - button "Decline" [ref=e830] [cursor=pointer]
      - button "Accept All" [ref=e831] [cursor=pointer]
```

# Test source

```ts
  15  | //   4. /contact form lands inbound message to ops inbox
  16  | //
  17  | // Why a separate spec instead of folding into pass 5/7/8?  Those
  18  | // passes are surface scans — they catch problems on individual
  19  | // pages. This pass catches problems in transitions BETWEEN pages,
  20  | // which is where flow regressions hide. A button that compiles and
  21  | // renders fine but navigates to the wrong URL is invisible to
  22  | // pass-level scans and lethal to conversion.
  23  | 
  24  | import { test, expect, type Page } from "@playwright/test";
  25  | 
  26  | const STAMP = `smoke-probe-${Date.now().toString(36)}`;
  27  | 
  28  | // Wait long enough for Clerk's dev_browser handshake to land before
  29  | // interacting — same fix pattern that closed EMR-710. networkidle
  30  | // is the cheapest reliable signal that React has fully hydrated.
  31  | async function loadHydrated(page: Page, path: string) {
  32  |   await page.goto(path, { waitUntil: "networkidle", timeout: 30_000 });
  33  | }
  34  | 
  35  | // Leafmart mounts a cannabis 21+ age-confirmation modal on first
  36  | // visit; it blocks all interaction until dismissed. The hook
  37  | // (src/lib/leafmart/age-confirmation.ts) reads
  38  | // `sessionStorage["leafmart:age-confirmed-21:v1"]`, so we can
  39  | // pre-set it through an init script and Playwright never sees
  40  | // the modal. This isn't a test-only backdoor — it's the same
  41  | // state the modal sets when a real user clicks "I am 21+".
  42  | async function preConfirmAgeGate(page: Page) {
  43  |   await page.addInitScript(() => {
  44  |     try {
  45  |       sessionStorage.setItem("leafmart:age-confirmed-21:v1", "1");
  46  |     } catch {
  47  |       // sessionStorage unavailable — fall through; the modal will
  48  |       // appear and the test will fail loudly, which is fine.
  49  |     }
  50  |   });
  51  | }
  52  | 
  53  | test.describe("Commercial conversion smoke — pass 9", () => {
  54  |   test.beforeEach(async ({ page }) => {
  55  |     // Every test in this pass touches /leafmart at some point (either
  56  |     // directly or via the marketplace hub which shares the gate). Pre-
  57  |     // confirming once in beforeEach keeps the body of each test focused
  58  |     // on the conversion flow itself.
  59  |     await preConfirmAgeGate(page);
  60  |   });
  61  | 
  62  |   test("landing → book-demo → form submit", async ({ page }) => {
  63  |     await loadHydrated(page, "/");
  64  | 
  65  |     // The hero CTA should reach /book-demo. There are several places
  66  |     // that say "Book a demo" on the landing; the visible top-of-page
  67  |     // CTA is the one we care about. Constrain to the first match
  68  |     // visible above the fold.
  69  |     const bookDemoLink = page
  70  |       .locator('a[href="/book-demo"], a[href^="/book-demo"]')
  71  |       .first();
  72  |     await expect(bookDemoLink).toBeVisible();
  73  |     await bookDemoLink.click();
  74  | 
  75  |     await page.waitForURL(/\/book-demo(\?.*)?$/, { timeout: 15_000 });
  76  |     await page.waitForLoadState("networkidle");
  77  | 
  78  |     // Fill the form and submit. Stub /api/contact so we don't generate
  79  |     // founder-inbox noise but still confirm the request fires.
  80  |     let posted = false;
  81  |     await page.route("**/api/contact**", async (route) => {
  82  |       posted = true;
  83  |       await route.fulfill({
  84  |         status: 200,
  85  |         contentType: "application/json",
  86  |         body: JSON.stringify({ ok: true, stubbed: true }),
  87  |       });
  88  |     });
  89  | 
  90  |     await page.locator('input[name="firstName"]').fill(STAMP);
  91  |     await page.locator('input[name="lastName"]').fill("Smoke");
  92  |     await page.locator('input[name="email"]').fill(`${STAMP}@example.com`);
  93  |     await page.locator('input[name="organization"]').fill("Smoke Health");
  94  |     await page.locator('input[name="phone"]').fill("555-555-5555");
  95  |     await page.locator('select[name="teamSize"]').selectOption({ index: 1 });
  96  |     await page
  97  |       .locator('textarea[name="message"]')
  98  |       .fill(`commercial conversion smoke ${STAMP}`);
  99  | 
  100 |     await page.locator('button[type="submit"]').first().click();
  101 |     await page.waitForTimeout(2500);
  102 | 
  103 |     expect(posted, "expected POST to /api/contact after Book demo submit").toBe(
  104 |       true,
  105 |     );
  106 |   });
  107 | 
  108 |   test("landing → marketplace → product detail renders", async ({ page }) => {
  109 |     await loadHydrated(page, "/");
  110 | 
  111 |     // The site header has a "Marketplace" link. Click it.
  112 |     const marketplaceLink = page
  113 |       .locator('header a[href="/marketplace"]')
  114 |       .first();
> 115 |     await expect(marketplaceLink).toBeVisible();
      |                                   ^ Error: expect(locator).toBeVisible() failed
  116 |     await marketplaceLink.click();
  117 | 
  118 |     await page.waitForURL(/\/marketplace(\?.*)?$/, { timeout: 15_000 });
  119 |     await page.waitForLoadState("networkidle");
  120 | 
  121 |     // The first product card should be clickable. Marketplace cards
  122 |     // link to /marketplace/products/<slug> per
  123 |     // src/app/marketplace/marketplace-client.tsx:308.
  124 |     const firstProductLink = page
  125 |       .locator('a[href^="/marketplace/products/"]')
  126 |       .first();
  127 |     await expect(firstProductLink).toBeVisible();
  128 | 
  129 |     const href = await firstProductLink.getAttribute("href");
  130 |     expect(
  131 |       href,
  132 |       "first marketplace product card should link to a real /marketplace/products/<slug>",
  133 |     ).toMatch(/^\/marketplace\/products\/[a-z0-9-]+$/);
  134 | 
  135 |     await firstProductLink.click();
  136 |     await page.waitForURL(/\/marketplace\/products\//, { timeout: 15_000 });
  137 |     await page.waitForLoadState("networkidle");
  138 | 
  139 |     // PDP must show: an <h1> (product name), the brand eyebrow, and a
  140 |     // price. If any of these aren't visible, the page is structurally
  141 |     // broken even if the route returns 200.
  142 |     await expect(page.locator("h1")).toBeVisible();
  143 |     await expect(page.getByText(/\$\d/).first()).toBeVisible();
  144 |     // Look for the "About this product" section header that the PDP
  145 |     // always renders — a stable structural marker.
  146 |     await expect(
  147 |       page.getByRole("heading", { name: /about this product/i }),
  148 |     ).toBeVisible();
  149 |   });
  150 | 
  151 |   test("landing → leafmart shop → category → product detail", async ({
  152 |     page,
  153 |   }) => {
  154 |     await loadHydrated(page, "/leafmart");
  155 | 
  156 |     // Click any category tile — the leafmart hub renders 17 of them,
  157 |     // all linking to /leafmart/category/<slug>. Pick the first one,
  158 |     // which is the curated "rest" shelf.
  159 |     const categoryLink = page
  160 |       .locator('a[href^="/leafmart/category/"]')
  161 |       .first();
  162 |     await expect(categoryLink).toBeVisible();
  163 |     await categoryLink.click();
  164 | 
  165 |     await page.waitForURL(/\/leafmart\/category\//, { timeout: 15_000 });
  166 |     await page.waitForLoadState("networkidle");
  167 | 
  168 |     // Category page should show a shelf header (<h1>) and product cards.
  169 |     await expect(page.locator("h1")).toBeVisible();
  170 | 
  171 |     // Click the first leafmart product card.
  172 |     const productLink = page
  173 |       .locator('a[href^="/leafmart/products/"]')
  174 |       .first();
  175 |     await expect(productLink).toBeVisible();
  176 |     await productLink.click();
  177 | 
  178 |     await page.waitForURL(/\/leafmart\/products\//, { timeout: 15_000 });
  179 |     await page.waitForLoadState("networkidle");
  180 | 
  181 |     // PDP renders.
  182 |     await expect(page.locator("h1, h2").first()).toBeVisible();
  183 |   });
  184 | 
  185 |   test("contact form delivers to /api/contact", async ({ page }) => {
  186 |     // Direct test that the contact-form pipeline is intact. Pass 5
  187 |     // covers this against a stub; this version verifies the path is
  188 |     // observable end-to-end through to the dev API logger.
  189 |     let posted = false;
  190 |     await page.route("**/api/contact**", async (route) => {
  191 |       posted = true;
  192 |       await route.fulfill({
  193 |         status: 200,
  194 |         contentType: "application/json",
  195 |         body: JSON.stringify({ ok: true, stubbed: true }),
  196 |       });
  197 |     });
  198 | 
  199 |     await loadHydrated(page, "/contact");
  200 | 
  201 |     await page.locator('input[name="name"]').fill(`${STAMP} smoke`);
  202 |     await page.locator('input[name="email"]').fill(`${STAMP}@example.com`);
  203 |     await page
  204 |       .locator('textarea[name="message"]')
  205 |       .fill(`commercial conversion smoke probe ${STAMP}`);
  206 | 
  207 |     await page.locator('button[type="submit"]').first().click();
  208 |     await page.waitForTimeout(2500);
  209 | 
  210 |     expect(posted, "expected POST to /api/contact after /contact submit").toBe(
  211 |       true,
  212 |     );
  213 | 
  214 |     // Confirm the success state actually renders — silent-drop bugs
  215 |     // can leave a spinner spinning forever. The form swaps in a
```