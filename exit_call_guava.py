#!/usr/bin/env python3
"""Real phone exit call with Guava.

The Guava agent phones the departing teammate, asks the gap questions, and drops each answer
into ./inbox as a call transcript. Triggerware sees the new files and the app re-reads the accounts.

Setup:  pip3 install guava-sdk
.env:   GUAVA_API_KEY=gva-...   GUAVA_AGENT_NUMBER=+1...   EXIT_CALL_TO=+1...(your phone)
Run:    python3 exit_call_guava.py
"""
import os, time, datetime
import guava
from guava import Agent, Field

ROOT = os.path.dirname(os.path.abspath(__file__))
for line in open(os.path.join(ROOT, ".env")) if os.path.exists(os.path.join(ROOT, ".env")) else []:
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        if v.strip():
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

NAME = "Maya"
QUESTIONS = [
    ("lakeview", "Lakeview Family Dental",
     "On the May 6 call you told Lakeview Family Dental you'd find out why texting fails and confirm it will work. Did that happen? If not, what should the new owner know before calling Rosa?"),
    ("brightsmiles", "Bright Smiles Dental Group",
     "You promised to call Ridgeline Tech, their IT company, to set up the integration. Did that happen, and who should the new owner talk to?"),
    ("peak", "Peak Motion Physical Therapy",
     "What's the one thing about Peak Motion Physical Therapy that isn't in your notes, but the new owner needs to know?"),
]

import sys, json
APP_ID = sys.argv[sys.argv.index("--app") + 1] if "--app" in sys.argv else None
CALLS = os.path.join(ROOT, ".calls")
TURNS = []


def status(st):
    """When the app started this call, tell it what's happening (it polls .calls/<id>.json)."""
    if APP_ID:
        with open(os.path.join(CALLS, APP_ID + ".json"), "w") as f:
            json.dump({"status": st, "transcript": TURNS}, f)


if APP_ID:
    spec = json.load(open(os.path.join(CALLS, APP_ID + ".questions.json")))
    NAME = (spec.get("name") or "Maya").split(" ")[0]
    QUESTIONS = [(f"q{i+1}", "", q) for i, q in enumerate(spec.get("questions") or [])] or QUESTIONS

agent = Agent(
    name="Handoff Brain",
    organization="Northwind",
    purpose=f"Interview {NAME}, an onboarding consultant on her last day, to capture what her customer call notes are missing, so the teammate inheriting her accounts can keep every promise.",
)


@agent.on_call_start
def on_call_start(call: guava.Call):
    status("ringing")
    call.reach_person(
        contact_full_name=NAME,
        greeting=f"Hi {NAME}, this is Handoff Brain from Northwind. Before your last day, I have three quick questions about your customer accounts. Is now okay?",
    )


@agent.on_reach_person
def on_reach_person(call: guava.Call, outcome: str) -> None:
    if outcome == "available":
        TURNS.append({"role": "agent", "message": f"Hi {NAME}, this is Handoff Brain. I have {len(QUESTIONS)} quick questions about your accounts."})
        status("in-progress")
        call.set_task(
            "exit_interview",
            objective=f"Ask {NAME} each question, one at a time. Let her answer fully. Be warm and brief. Never invent facts.",
            checklist=[Field(key=key, description=f"What {NAME} says" + (f" about {clinic}" if clinic else ""), question=q, field_type="text")
                       for key, clinic, q in QUESTIONS],
        )
    else:
        TURNS.append({"role": "agent", "message": f"{NAME} didn't pick up."})
        status("failed")
        call.hangup("Say you'll try again later and end the call politely.")


@agent.on_task_complete("exit_interview")
def on_done(call: guava.Call):
    today = datetime.date.today().strftime("%b %-d")
    if APP_ID:
        for key, clinic, q in QUESTIONS:
            try:
                answer = call.get_field(key) or "(no answer)"
            except Exception:
                answer = "(no answer)"
            TURNS.append({"role": "agent", "message": q})
            TURNS.append({"role": "user", "message": answer})
        status("done")
        call.hangup("Thank her, wish her luck in her new role, and say the brain has been updated. Then end the call.")
        return
    os.makedirs(os.path.join(ROOT, "inbox"), exist_ok=True)
    for key, clinic, q in QUESTIONS:
        try:
            answer = call.get_field(key) or "(no answer)"
        except Exception:
            answer = "(no answer)"
        text = (f"{clinic} · {today} · Exit call with Maya Chen (phone) · 2 min\n\n"
                f"Handoff Brain: {q}\nMaya: {answer}\n")
        path = os.path.join(ROOT, "inbox", f"exit-call-{int(time.time())}-{key}.txt")
        with open(path, "w") as f:
            f.write(text)
        print("saved", path)
    call.hangup("Thank her, wish her luck in her new role, and say the brain has been updated. Then end the call.")


if __name__ == "__main__":
    to = os.environ.get("EXIT_CALL_TO")
    frm = os.environ.get("GUAVA_AGENT_NUMBER")
    if not (os.environ.get("GUAVA_API_KEY") and to and frm):
        raise SystemExit("Add GUAVA_API_KEY, GUAVA_AGENT_NUMBER and EXIT_CALL_TO to .env first.")
    print(f"Calling {to} from {frm} …")
    agent.call_phone(from_number=frm, to_number=to, variables={})
