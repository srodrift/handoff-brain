# Handoff Brain

**The company brain that keeps your word.**

When a teammate changes roles, goes on leave or quits, their customers get handed to someone new. What was actually said and promised lives in hours of call recordings that nobody has time to read, so promises slip and customers notice first.

Handoff Brain reads every call a departing teammate had and gives the person who inherits the accounts a plan they can act on Monday morning.

Built at the TechEquity Ai Company Brain Hackathon (Nov 4, 2026, Snowflake SVAI, Menlo Park). All demo data (clinics, people, addresses, phone numbers) is fictional; the vendor is a made-up company called "Northwind."

## What it does

| Feature | How it works |
|---|---|
| **Read everything in 60 seconds** | An LLM reads every call transcript for every inherited account and marks each one red, amber or green with a one-sentence reason. |
| **Start here** | The landing page for the new owner: first moves across every account, most urgent first, each with the reason why. |
| **Handoff cards** | Onboarding journey, risks, promises, next-call plan and a CRM-ready note, with the account record (address, main line, primary contact) next to what was said on calls. |
| **✓ Verified receipts** | Every quote is checked word for word against the real transcript in code. If it isn't there, it doesn't get the badge. |
| **Ask anything, two modes** | History questions are answered only from the record and calls, with the quote. "What should I do?" questions get the brain's own advice, clearly labeled as a recommendation. |
| **Promise Radar** | Promises we broke, promises we owe, what customers owe us, and what we kept. "Keep the promise" drafts the follow-up. |
| **Real phone exit call** | A Guava voice agent phones the departing teammate and asks what their notes are missing. Answers are written back as call transcripts. |
| **Hands-free ingestion** | New transcripts land in `inbox/`; a Triggerware trigger sees them and the matching account re-reads itself. No pasting. |
| **Product Insights** | Patterns across every call, in customers' own words, for product managers. |
| **Brief me in 60s** | ElevenLabs voice briefing per account. |

## Stack
- **Triggerware** (local server + Python SDK): Lua tables over the brain's live data (accounts, promises, call inbox) and standing SQL triggers (`hb_new_calls`, `hb_at_risk_accounts`, `hb_open_promises`, …)
- **AppStarter**: generated the build spec (see `SPEC.md`)
- **Guava** (`guava-sdk`): outbound exit call on a real phone line (`exit_call_guava.py`)
- **LLM**: provider-agnostic, OpenAI-compatible layer: Groq, Gemini or Claude (`LLM_PROVIDER`). If a model is retired, the server picks an available one.
- **ElevenLabs**: text-to-speech briefings
- Front end: plain HTML/JS. Back end: Python standard library server that keeps every API key off the browser.

Every AI feature falls back to a prepared summary, so the demo keeps working if a model is overloaded.

## Run it
```sh
# 1. Triggerware (macOS)
curl -fsSL https://tw2-releases.s3.us-east-2.amazonaws.com/install.sh | sh
curl -fsSL https://tw2-releases.s3.us-east-2.amazonaws.com/cli/install.sh | sh
triggerware start
pip3 install triggerware guava-sdk

# 2. Keys
cp .env.example .env
#   LLM_PROVIDER=groq  and  GROQ_API_KEY=...   (or GEMINI_API_KEY / ANTHROPIC_API_KEY)
#   ELEVENLABS_API_KEY=...                       (optional, voice briefings)
#   GUAVA_API_KEY=...  GUAVA_AGENT_NUMBER=+1...  EXIT_CALL_TO=+1...   (optional, real phone call)

# 3. One-time Triggerware tables + triggers
python3 tw_setup.py

# 4. Start
./run.sh                      # opens http://localhost:8787

# 5. Real exit call (in another terminal)
python3 exit_call_guava.py
```

## Demo
1. **Read everything in 60 seconds** → every account gets a verdict.
2. **Start here** → first moves, most urgent first.
3. Open **Lakeview Family Dental** → handoff card, click a ✓ verified quote.
4. Ask *"What did Maya promise Rosa?"*, then on Harbor Point ask *"What should I ask the carrier?"*
5. **Promise Radar** → **Keep this promise**.
6. Run `python3 exit_call_guava.py` → your phone rings → answer as Maya → the accounts update.
7. **Product Insights** → patterns across accounts.
