#!/usr/bin/env python3
"""Handoff Brain local server.

Serves the app and proxies three services so API keys never reach the browser:
  - Claude (Anthropic)    answers, SOP audits, exit-interview questions, ingest
  - ElevenLabs            voice for the exit interview (text-to-speech, speech-to-text)
  - Triggerware (local)   tables + standing triggers over the brain's live data

Keys are read from a .env file next to this script (see .env.example).
Run:  python3 server.py   then open http://localhost:8787
"""
import asyncio, json, os, ssl, sys, threading, time, uuid, urllib.parse, urllib.request, urllib.error
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

ROOT = os.path.dirname(os.path.abspath(__file__))
PUBLIC = os.path.join(ROOT, "public")
# Triggerware tables read files relative to its home, so the live data lives there.
TW_HOME = os.path.expanduser(os.environ.get("TRIGGERWARE_HOME", "~/.triggerware"))
DATA = os.path.join(TW_HOME, "hb_data")
os.makedirs(DATA, exist_ok=True)


def load_env_file():
    p = os.path.join(ROOT, ".env")
    if os.path.exists(p):
        for line in open(p):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                if v.strip():
                    os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


load_env_file()
PORT = int(os.environ.get("PORT", "8787"))
HOST = os.environ.get("HOST", "127.0.0.1")
PUBLIC_DEMO = os.environ.get("PUBLIC_DEMO") == "1"   # hosted copy: never place phone calls
MODEL = os.environ.get("CLAUDE_MODEL", "claude-sonnet-5-5")
VOICE = os.environ.get("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")  # "Rachel", a default ElevenLabs voice
TW_ADDR = os.environ.get("TRIGGERWARE_ADDR", "localhost:5221")
TW_TRIGGERS = ["hb_at_risk_accounts", "hb_open_promises", "hb_new_calls", "hb_ticket_routing", "hb_knowledge_at_risk"]


# ---------------------------------------------------------------- HTTP helpers
def _ssl_context():
    # Prefer the operating system's trust store (works behind office Wi-Fi that inspects HTTPS),
    # then certifi, then Python's default.
    try:
        import truststore
        return truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    except Exception:
        pass
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


SSL_CTX = _ssl_context()


def http(url, headers, data, timeout=90):
    req = urllib.request.Request(url, data=data, method="POST", headers={**headers, "User-Agent": "handoff-brain/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=SSL_CTX) as r:
            return r.status, r.headers.get("content-type", ""), r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get("content-type", ""), e.read()
    except Exception as e:
        return 599, "application/json", json.dumps({"error": str(e)}).encode()


# ---------------------------------------------------------------- Claude
# Free alternatives speak the OpenAI chat format. Pick one with LLM_PROVIDER in .env.
OPENAI_COMPAT = {
    "gemini": ("GEMINI_API_KEY", "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", "gemini-3.8-flash"),
    "groq":   ("GROQ_API_KEY", "https://api.groq.com/openai/v1/chat/completions", "openai/gpt-oss-120b"),
}


def provider():
    p = os.environ.get("LLM_PROVIDER", "").lower()
    if p in OPENAI_COMPAT or p == "anthropic":
        return p
    for name, (k, _, _) in OPENAI_COMPAT.items():
        if os.environ.get(k):
            return name
    return "anthropic"


def llm_ready():
    p = provider()
    return bool(os.environ.get("ANTHROPIC_API_KEY") if p == "anthropic" else os.environ.get(OPENAI_COMPAT[p][0]))


def llm_model():
    p = provider()
    return MODEL if p == "anthropic" else os.environ.get("LLM_MODEL", OPENAI_COMPAT[p][2])


def openai_compat(p, system, user, max_tokens):
    keyname, url, _ = OPENAI_COMPAT[p]
    key = os.environ.get(keyname)
    if not key:
        return 503, {"error": f"{keyname} not set in .env"}
    body = {"model": llm_model(), "max_tokens": max_tokens,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}
    code, _, raw = http(url, {"content-type": "application/json", "authorization": f"Bearer {key}"}, json.dumps(body).encode())
    try:
        j = json.loads(raw.decode() or "{}")
    except Exception:
        j = {"error": raw[:300].decode(errors="replace")}
    if isinstance(j, list) and j:
        j = j[0]
    if code != 200 and "model" in str(j).lower() and not os.environ.get("_LLM_RETRIED"):
        # The model was retired: ask the provider which models exist and switch to one.
        try:
            req = urllib.request.Request(url.replace("/chat/completions", "/models"),
                                         headers={"authorization": f"Bearer {key}", "User-Agent": "handoff-brain/1.0"})
            with urllib.request.urlopen(req, timeout=30, context=SSL_CTX) as r:
                ids = [m.get("id", "") for m in json.loads(r.read().decode()).get("data", [])]
            prefs = ["openai/gpt-oss-120b", "llama-3.3-70b", "llama-4", "qwen", "gpt-oss", "llama", "gemini"]
            chat = [i for i in ids if not any(x in i.lower() for x in ("whisper", "tts", "guard", "embed", "audio", "image", "orpheus", "playai"))]
            pick = next((i for pr in prefs for i in chat if pr in i.lower()), chat[0] if chat else None)
            if pick:
                print("  switching model to", pick)
                os.environ["LLM_MODEL"] = pick
                os.environ["_LLM_RETRIED"] = "1"
                try:
                    return openai_compat(p, system, user, max_tokens)
                finally:
                    os.environ.pop("_LLM_RETRIED", None)
        except Exception as e:
            print("  model lookup failed:", e)
    if code != 200:
        return code, {"error": j.get("error", j) if isinstance(j, dict) else j}
    msg = j["choices"][0]["message"]
    return 200, {"text": msg.get("content") or ""}


def claude(system, user, max_tokens=1500):
    """Call the configured AI, retrying when the provider is overloaded (429/5xx)."""
    last = (599, {"error": "no attempt"})
    for wait in (0, 2, 5, 9):
        if wait:
            time.sleep(wait)
        last = _llm_once(system, user, max_tokens)
        if last[0] == 200 or last[0] not in (429, 500, 502, 503, 504, 529, 599):
            return last
    return last


def _llm_once(system, user, max_tokens=1500):
    p = provider()
    if p != "anthropic":
        return openai_compat(p, system, user, max(max_tokens, 4000))
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        return 503, {"error": "ANTHROPIC_API_KEY not set in .env"}
    body = {"model": MODEL, "max_tokens": max_tokens, "system": system,
            "messages": [{"role": "user", "content": user}]}
    code, _, raw = http("https://api.anthropic.com/v1/messages",
                        {"content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01"},
                        json.dumps(body).encode())
    try:
        j = json.loads(raw.decode() or "{}")
    except Exception:
        j = {"error": raw[:300].decode(errors="replace")}
    if code != 200:
        return code, {"error": j.get("error", j)}
    return 200, {"text": "".join(b.get("text", "") for b in j.get("content", []) if b.get("type") == "text")}


# ---------------------------------------------------------------- ElevenLabs
def tts(text):
    key = os.environ.get("ELEVENLABS_API_KEY")
    if not key:
        return 503, "application/json", json.dumps({"error": "ELEVENLABS_API_KEY not set in .env"}).encode()
    return http(f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE}",
                {"content-type": "application/json", "xi-api-key": key, "accept": "audio/mpeg"},
                json.dumps({"text": text, "model_id": os.environ.get("ELEVENLABS_TTS_MODEL", "eleven_flash_v2_5")}).encode())


def stt(audio, mime):
    key = os.environ.get("ELEVENLABS_API_KEY")
    if not key:
        return 503, {"error": "ELEVENLABS_API_KEY not set in .env"}
    b = "----hb" + uuid.uuid4().hex
    ext = "webm" if "webm" in mime else ("mp4" if "mp4" in mime else "wav")
    parts = [
        f'--{b}\r\nContent-Disposition: form-data; name="model_id"\r\n\r\n{os.environ.get("ELEVENLABS_STT_MODEL", "scribe_v1")}\r\n'.encode(),
        f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="answer.{ext}"\r\nContent-Type: {mime}\r\n\r\n'.encode(),
        audio, f"\r\n--{b}--\r\n".encode()]
    code, _, raw = http("https://api.elevenlabs.io/v1/speech-to-text",
                        {"content-type": f"multipart/form-data; boundary={b}", "xi-api-key": key}, b"".join(parts))
    try:
        j = json.loads(raw.decode())
    except Exception:
        j = {"error": raw[:300].decode(errors="replace")}
    return (200, {"text": j.get("text", "")}) if code == 200 else (code, {"error": j})


# ---------------------------------------------------------------- Phone exit call (ElevenLabs agent + Twilio number)
def guava_ready():
    return all(os.environ.get(k) for k in ("GUAVA_API_KEY", "GUAVA_AGENT_NUMBER", "EXIT_CALL_TO"))


CALLS_DIR = os.path.join(ROOT, ".calls")
GUAVA_PROCS = {}


def guava_call(questions, name):
    """Starts exit_call_guava.py for these questions. It writes live status to .calls/<id>.json."""
    import subprocess, time as _t
    os.makedirs(CALLS_DIR, exist_ok=True)
    cid = f"guava-{int(_t.time())}"
    qfile = os.path.join(CALLS_DIR, cid + ".questions.json")
    with open(qfile, "w") as f:
        json.dump({"name": name, "questions": questions}, f)
    with open(os.path.join(CALLS_DIR, cid + ".json"), "w") as f:
        json.dump({"status": "ringing", "transcript": []}, f)
    log = open(os.path.join(CALLS_DIR, cid + ".log"), "w")
    GUAVA_PROCS[cid] = subprocess.Popen([sys.executable, os.path.join(ROOT, "exit_call_guava.py"), "--app", cid],
                                        cwd=ROOT, stdout=log, stderr=subprocess.STDOUT)
    return 200, {"conversation_id": cid}


def guava_status(cid):
    cid = "".join(c for c in cid if c.isalnum() or c in "-_")
    try:
        with open(os.path.join(CALLS_DIR, cid + ".json")) as f:
            j = json.load(f)
    except Exception:
        j = {"status": "ringing", "transcript": []}
    proc = GUAVA_PROCS.get(cid)
    if j.get("status") not in ("done", "failed") and proc is not None and proc.poll() is not None:
        tail = ""
        try:
            tail = open(os.path.join(CALLS_DIR, cid + ".log")).read()[-300:]
        except Exception:
            pass
        j = {"status": "failed", "transcript": j.get("transcript", []), "error": tail}
    if j.get("status") in ("done", "failed") and proc is not None and proc.poll() is None:
        proc.terminate()
    return 200, j


def phone_ready():
    if PUBLIC_DEMO:
        return False
    if guava_ready():
        return True
    return all(os.environ.get(k) for k in ("ELEVENLABS_API_KEY", "ELEVENLABS_AGENT_ID", "ELEVENLABS_PHONE_NUMBER_ID", "EXIT_CALL_TO"))


def phone_call(questions, name):
    """Asks ElevenLabs to dial the departing employee from the imported Twilio number."""
    body = {"agent_id": os.environ["ELEVENLABS_AGENT_ID"],
            "agent_phone_number_id": os.environ["ELEVENLABS_PHONE_NUMBER_ID"],
            "to_number": os.environ["EXIT_CALL_TO"],
            "conversation_initiation_client_data": {"dynamic_variables": {
                "employee_name": name, "questions": "\n".join(f"{i+1}. {q}" for i, q in enumerate(questions))}}}
    code, _, raw = http("https://api.elevenlabs.io/v1/convai/twilio/outbound-call",
                        {"content-type": "application/json", "xi-api-key": os.environ["ELEVENLABS_API_KEY"]},
                        json.dumps(body).encode())
    try:
        j = json.loads(raw.decode() or "{}")
    except Exception:
        j = {"error": raw[:300].decode(errors="replace")}
    return code, j


def phone_status(conv_id):
    req = urllib.request.Request(f"https://api.elevenlabs.io/v1/convai/conversations/{urllib.parse.quote(conv_id)}",
                                 headers={"xi-api-key": os.environ.get("ELEVENLABS_API_KEY", "")})
    try:
        with urllib.request.urlopen(req, timeout=30, context=SSL_CTX) as r:
            j = json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, {"error": e.read().decode(errors="replace")[:300]}
    except Exception as e:
        return 599, {"error": str(e)}
    turns = [{"role": t.get("role"), "message": t.get("message") or ""} for t in (j.get("transcript") or []) if t.get("message")]
    return 200, {"status": j.get("status"), "transcript": turns}


# ---------------------------------------------------------------- Live data files (Triggerware tables read these)
def read_json(name, default):
    try:
        with open(os.path.join(DATA, name)) as f:
            return json.load(f)
    except Exception:
        return default


def write_json(name, obj):
    tmp = os.path.join(DATA, name + ".tmp")
    with open(tmp, "w") as f:
        json.dump(obj, f, indent=1)
    os.replace(tmp, os.path.join(DATA, name))


# ---------------------------------------------------------------- Triggerware (local server via official SDK)
TW = {"ok": False, "error": "not checked yet", "events": [], "seq": 0}
TW_LOCK = threading.Lock()


def tw_push(trigger, delta, source):
    with TW_LOCK:
        for kind in ("added", "deleted"):
            for row in delta.get(kind) or []:
                TW["seq"] += 1
                TW["events"].append({"seq": TW["seq"], "trigger": trigger, "kind": kind, "row": row,
                                     "source": source, "at": time.time()})
        TW["events"] = TW["events"][-300:]


async def tw_client():
    from triggerware import TriggerwareClient  # pip install triggerware
    return await TriggerwareClient.connect_tcp(TW_ADDR)


async def tw_loop():
    """Watch our triggers on the local Triggerware server and relay deltas to the browser."""
    while True:
        try:
            c = await tw_client()
            await c.system.health()
            names = await c.triggers.list()
            TW["ok"], TW["error"], TW["triggers"] = True, "", [n for n in names if n.startswith("hb_")]
            missing = [t for t in TW_TRIGGERS[:2] if t not in names]
            if missing:
                TW["error"] = "run  python3 tw_setup.py  (missing: " + ", ".join(missing) + ")"
            for name in TW_TRIGGERS:
                if name in names:
                    await c.triggers.watch(name, (lambda n: (lambda added, deleted: tw_push(n, {"added": added, "deleted": deleted}, "watch")))(name))
            while True:  # keepalive + poll fallback in case watch callbacks are not delivered
                await asyncio.sleep(2)
                for name in TW_TRIGGERS:
                    if name in names:
                        for d in await c.triggers.poll(name) or []:
                            tw_push(name, d, "poll")
        except ImportError:
            TW["ok"], TW["error"] = False, "Python SDK missing: run  pip3 install triggerware"
            await asyncio.sleep(10)
        except Exception as e:
            TW["ok"], TW["error"] = False, f"Triggerware not reachable at {TW_ADDR}: {e}"
            await asyncio.sleep(5)


async def tw_sql(sql):
    c = await tw_client()
    cur = await c.cursors.open(sql=sql, batch_size=200)
    rows = list(cur._cache)
    while not cur.exhausted and len(rows) < 500:
        more = await cur.fetch()
        if not more:
            break
        rows = list(cur._cache)
    cols = [col.get("name") if isinstance(col, dict) else str(col) for col in (cur.signature or [])]
    try:
        await cur.close()
    except Exception:
        pass
    return {"sql": sql, "columns": cols, "rows": rows}


async def tw_run(name):
    c = await tw_client()
    d = await c.triggers.run(name)
    tw_push(name, d, "run")
    return d


# ---------------------------------------------------------------- Call inbox (hands-free transcripts)
# Transcripts dropped into ./inbox (by a recorder export, or dragged in) are mirrored into Triggerware's
# home so the hb_calls table can see them; the hb_new_calls trigger fires for each new file.
INBOX = os.path.join(ROOT, "inbox")
TW_INBOX = os.path.join(TW_HOME, "hb_inbox")
os.makedirs(INBOX, exist_ok=True)
os.makedirs(TW_INBOX, exist_ok=True)


def inbox_files():
    return sorted(f for f in os.listdir(TW_INBOX) if f.endswith(".txt"))


def mirror_inbox():
    while True:
        try:
            for f in os.listdir(INBOX):
                if f.endswith(".txt"):
                    src, dst = os.path.join(INBOX, f), os.path.join(TW_INBOX, f)
                    if not os.path.exists(dst):
                        with open(src, "rb") as a, open(dst + ".tmp", "wb") as b:
                            b.write(a.read())
                        os.replace(dst + ".tmp", dst)
        except Exception as e:
            sys.stderr.write(f"  inbox mirror: {e}\n")
        time.sleep(1)


def demo_recorder(delay):
    """Simulates a call recorder delivering the next call: copies a sample transcript into the inbox."""
    def go():
        time.sleep(delay)
        src = os.path.join(ROOT, "samples", "lakeview-followup.txt")
        name = f"recorder-{int(time.time())}-lakeview-followup.txt"
        with open(src, "rb") as a, open(os.path.join(INBOX, name), "wb") as b:
            b.write(a.read())
    threading.Thread(target=go, daemon=True).start()


def start_tw_thread():
    t = threading.Thread(target=lambda: asyncio.run(tw_loop()), daemon=True)
    t.start()


# ---------------------------------------------------------------- HTTP server
class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=PUBLIC, **kw)

    def log_message(self, fmt, *args):
        if "/api/tw/events" not in str(args[0] if args else ""):
            sys.stderr.write("  " + (fmt % args) + "\n")

    def send(self, code, obj, ctype="application/json"):
        data = obj if isinstance(obj, (bytes, bytearray)) else json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("content-type", ctype)
        self.send_header("content-length", str(len(data)))
        self.send_header("cache-control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def body(self):
        n = int(self.headers.get("content-length", "0"))
        return self.rfile.read(n) if n else b""

    def do_GET(self):
        if self.path == "/favicon.ico":
            return self.send(204, b"", "image/x-icon")
        if self.path == "/api/status":
            return self.send(200, {"claude": llm_ready(), "model": llm_model(), "provider": provider(),
                                   "voice": bool(os.environ.get("ELEVENLABS_API_KEY")), "phone": phone_ready(),
                                   "triggerware": TW["ok"], "triggerware_error": TW["error"],
                                   "triggers": TW.get("triggers", [])})
        if self.path.startswith("/api/call/status/"):
            cid = self.path.rsplit("/", 1)[-1]
            return self.send(*(guava_status(cid) if cid.startswith("guava-") else phone_status(cid)))
        if self.path == "/api/inbox":
            return self.send(200, {"files": inbox_files()})
        if self.path.startswith("/api/inbox/"):
            name = os.path.basename(urllib.parse.unquote(self.path.split("/api/inbox/", 1)[1]))
            p = os.path.join(TW_INBOX, name)
            if not name.endswith(".txt") or not os.path.exists(p):
                return self.send(404, {"error": "not found"})
            return self.send(200, {"name": name, "text": open(p, encoding="utf-8", errors="replace").read()})
        if self.path.startswith("/api/cache/"):
            name = "".join(c for c in self.path.rsplit("/", 1)[-1] if c.isalnum() or c in "-_")
            return self.send(200, read_json("cache_" + name + ".json", None))
        if self.path.startswith("/api/tw/events"):
            since = int(self.path.split("since=")[-1]) if "since=" in self.path else 0
            with TW_LOCK:
                ev = [e for e in TW["events"] if e["seq"] > since]
            return self.send(200, {"events": ev, "seq": TW["seq"]})
        return super().do_GET()

    def do_POST(self):
        p = self.path
        if p == "/api/stt":
            code, j = stt(self.body(), self.headers.get("content-type", "audio/webm"))
            return self.send(code, j)
        try:
            body = json.loads(self.body().decode() or "{}")
        except Exception:
            return self.send(400, {"error": "bad json"})
        if p == "/api/call/phone":
            if not phone_ready():
                return self.send(503, {"error": "Phone call not configured: set GUAVA_API_KEY, GUAVA_AGENT_NUMBER and EXIT_CALL_TO in .env"})
            if guava_ready():
                return self.send(*guava_call(body.get("questions", []), body.get("name", "")))
            return self.send(*phone_call(body.get("questions", []), body.get("name", "")))
        if p == "/api/recorder/demo":
            demo_recorder(float(body.get("delay", 8)))
            return self.send(200, {"ok": True})
        if p == "/api/claude":
            return self.send(*claude(body.get("system", ""), body.get("user", ""), body.get("max_tokens", 1500)))
        if p == "/api/tts":
            code, ctype, raw = tts(body.get("text", "")[:900])
            return self.send(code, raw, ctype or "audio/mpeg")
        if p.startswith("/api/cache/"):
            name = "".join(c for c in p.rsplit("/", 1)[-1] if c.isalnum() or c in "-_")
            write_json("cache_" + name + ".json", body)
            return self.send(200, {"ok": True})
        if p == "/api/data":  # browser publishes the brain's current state; Triggerware tables read these files
            for name in ("tickets", "experts", "topic_risk", "documents", "accounts", "promises"):
                if name in body:
                    write_json(name + ".json", body[name])
            return self.send(200, {"ok": True})
        if p == "/api/tickets":
            tickets = read_json("tickets.json", [])
            tickets.append(body)
            write_json("tickets.json", tickets)
            return self.send(200, {"ok": True, "count": len(tickets)})
        if p == "/api/tw/sql":
            try:
                return self.send(200, asyncio.run(tw_sql(body.get("sql", ""))))
            except Exception as e:
                return self.send(502, {"error": str(e)})
        if p == "/api/tw/run":
            try:
                return self.send(200, asyncio.run(tw_run(body.get("name", ""))))
            except Exception as e:
                return self.send(502, {"error": str(e)})
        return self.send(404, {"error": "unknown route"})


if __name__ == "__main__":
    start_tw_thread()
    threading.Thread(target=mirror_inbox, daemon=True).start()
    on = lambda k: "ON " if os.environ.get(k) else "off"
    print(f"\n  Handoff Brain  ->  http://localhost:{PORT}\n")
    print(f"  AI           {'ON ' if llm_ready() else 'off'}  ({provider()}: {llm_model()})")
    print(f"  ElevenLabs   {on('ELEVENLABS_API_KEY')}")
    print(f"  Triggerware  connecting to {TW_ADDR} ... (status shows in the app)\n")
    ThreadingHTTPServer((HOST, PORT), H).serve_forever()
