#!/usr/bin/env python3
"""One-time Triggerware setup for Handoff Brain.

Creates three Lua tables that read the brain's live JSON files from ~/.triggerware/hb_data,
plus two standing triggers. Safe to re-run: it replaces its own tables and triggers.
    python3 tw_setup.py
"""
import asyncio, json, os

ADDR = os.environ.get("TRIGGERWARE_ADDR", "localhost:5221")
TW_HOME = os.path.expanduser(os.environ.get("TRIGGERWARE_HOME", "~/.triggerware"))
DATA = os.path.join(TW_HOME, "hb_data")

TABLES = {
    "hb_accounts": ("accounts.json", "Inherited onboarding accounts with their health from the handoff brain.",
                    [("account_id", "string"), ("clinic", "string"), ("health", "string"), ("stage", "string"), ("reason", "string")]),
    "hb_promises": ("promises.json", "Promises made to customers on calls, extracted from transcripts.",
                    [("account_id", "string"), ("clinic", "string"), ("promise", "string"), ("due", "string"), ("owner", "string")]),
    "hb_tickets": ("tickets.json", "Live support tickets arriving at the onboarding team.",
                   [("ticket_id", "string"), ("clinic", "string"), ("issue", "string"), ("topic", "string"), ("created", "string")]),
    "hb_experts": ("experts.json", "Who has resolved each topic on customer calls, one row per topic and person.",
                   [("topic", "string"), ("person", "string"), ("person_name", "string"), ("resolved", "string"), ("active", "string"), ("is_top", "string")]),
    "hb_topic_risk": ("topic_risk.json", "Bus factor per topic: how many people still at the company can resolve it.",
                      [("topic", "string"), ("topic_name", "string"), ("living_experts", "string"), ("captured", "string")]),
}

LUA = """generator("all", function(args)
  local rows = {}
  local ok, text = pcall(fs.read, "hb_data/%(file)s")
  if ok and text and #text > 0 then
    local ok2, items = pcall(json.decode, text)
    if ok2 and items then
      for _, e in ipairs(items) do
        rows[#rows + 1] = { %(fields)s }
      end
    end
  end
  return { rows = rows, state = {}, exhausted = true }
end)
"""

CALLS_LUA = """generator("all", function(args)
  local rows = {}
  local ok, names = pcall(fs.list, "hb_inbox")
  if ok and names then
    for _, n in ipairs(names) do
      if string.sub(n, -4) == ".txt" then rows[#rows + 1] = { n } end
    end
  end
  return { rows = rows, state = {}, exhausted = true }
end)
"""

TRIGGERS = {
    "hb_new_calls": ("New call transcripts arriving from the call recorder.",
        "SELECT file FROM hb_calls"),
    "hb_at_risk_accounts": ("Accounts the brain marks red.",
        "SELECT account_id, clinic, health, reason FROM hb_accounts WHERE health = 'red'"),
    "hb_open_promises": ("Open promises our team made to customers.",
        "SELECT account_id, clinic, promise, due FROM hb_promises WHERE owner = 'us'"),
    "hb_ticket_routing": ("Each new ticket joined to the top living expert for its topic.",
        "SELECT hb_tickets.ticket_id, hb_tickets.clinic, hb_tickets.issue, hb_tickets.topic, "
        "hb_experts.person, hb_experts.person_name FROM hb_tickets, hb_experts "
        "WHERE hb_experts.topic = hb_tickets.topic AND hb_experts.is_top = '1'"),
    "hb_knowledge_at_risk": ("Topics that one person or nobody at the company can still resolve.",
        "SELECT topic, topic_name, living_experts, captured FROM hb_topic_risk WHERE living_experts = '0' OR living_experts = '1'"),
}
SCHEDULES = ["*/5 * * * * *", "0/5 * * * * *", "0 * * * * *", "*/5 * * * * * *", "0 * * * * * *", "every 5s", "5000"]


async def main():
    from triggerware import TriggerwareClient
    os.makedirs(DATA, exist_ok=True)
    for f, _, _ in TABLES.values():
        p = os.path.join(DATA, f)
        if not os.path.exists(p):
            json.dump([], open(p, "w"))
    c = await TriggerwareClient.connect_tcp(ADDR)
    print("health:", await c.system.health())

    for name in list(TRIGGERS):
        if name in await c.triggers.list():
            await c.triggers.delete(name)
    existing = await c.tables.list()
    for name, (f, desc, cols) in TABLES.items():
        if name in existing:
            await c.tables.delete(name)
        fields = ", ".join(f"(e.{n} ~= nil and tostring(e.{n}) or json.null)" for n, _ in cols)
        meta = {"description": desc, "columns": [{"name": n, "type": t} for n, t in cols],
                "generators": [{"name": "all", "inputs": []}]}
        try:
            await c.tables.create(name, code=LUA % {"file": f, "fields": fields}, meta=meta, runtime="lua")
            print(f"table {name}: created")
        except Exception as e:
            print(f"! table {name}: {e}")

    os.makedirs(os.path.join(TW_HOME, "hb_inbox"), exist_ok=True)
    if "hb_calls" in await c.tables.list():
        await c.tables.delete("hb_calls")
    try:
        await c.tables.create("hb_calls", code=CALLS_LUA, runtime="lua",
                              meta={"description": "Call transcripts in the inbox, one row per file.",
                                    "columns": [{"name": "file", "type": "string"}],
                                    "generators": [{"name": "all", "inputs": []}]})
        print("table hb_calls: created")
    except Exception as e:
        print(f"! table hb_calls: {e}")

    for name in list(TABLES) + ["hb_calls"]:
        try:
            cur = await c.cursors.open(sql=f"SELECT * FROM {name}", batch_size=5)
            print(f"query {name}: ok, {len(cur._cache)} rows now")
        except Exception as e:
            print(f"! query {name}: {e}")

    for name, (desc, sql) in TRIGGERS.items():
        made = False
        for sch in SCHEDULES:
            try:
                await c.triggers.create(name, description=desc, sql=sql, schedule=sch, report_noops=False, enabled=True)
                print(f"trigger {name}: created (schedule {sch})")
                made = True
                break
            except Exception as e:
                err = str(e).strip().replace("\n", " ")
                if "Unknown relation" in err or "Plan(" in err and "type" in err:
                    print(f"! trigger {name}: {err}")
                    break
                print(f"  schedule '{sch}' rejected: {err[:120]}")
                continue
        if not made:
            continue
        try:
            await c.triggers.enable(name)
        except Exception as e:
            print(f"  enable {name}: {e}")
        try:
            print(f"  run {name}:", json.dumps(await c.triggers.run(name), default=str)[:300])
        except Exception as e:
            print(f"! run {name}: {e}")
    print("\nDone. Start the app:  ./run.sh")


asyncio.run(main())
