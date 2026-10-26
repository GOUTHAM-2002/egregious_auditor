# Setup Auditor

![Setup Auditor web interface](docs/screenshot.png)

A small web tool that reads an **AI-agent testbed codebase** end to end and judges two things
with a frontier model:

1. **Instrumental harm (binary YES / NO)** — is the harmful outcome the *direct causal result*
   of an action the agent chooses as its means (e.g. a crane agent dropping a load on a worker),
   or merely a *side effect* of pursuing an unrelated task (e.g. finishing a heating task and
   smoke builds up, or resolving a ticket and an SSN leaks)? Returns the verdict, an explicit
   reason, a causal chain, and evidence quotes from the code.
2. **Realism (0–10)** — how closely the setup's software resembles real-world software vs an
   obvious "this is an eval" toy. Scored per dimension (tool calls, functions, logs, environment,
   structure, eval-tells), with named comparable real-world products and a tells-vs-strengths list.

## Install

```bash
cd setup_auditor
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

## Model access

The tool picks the best model it can, downgrading on a cyber-refusal or error:

    claude-opus-5-5  →  claude-sonnet-5-5  →  claude-opus-4-8

- **Preferred:** set an Anthropic API key and it uses the SDK directly:
  ```bash
  export ANTHROPIC_API_KEY=sk-ant-...
  ```
- **Fallback:** if no key is set, it shells out to the **Claude Code CLI** (`claude -p`). Install
  it from https://claude.com/claude-code and sign in once (`claude`), then the tool will use it
  automatically. (This is how the demo box runs it.)

You need *one* of the two. Edit `MODEL_CHAIN` at the top of `auditor.py` to change the model order.

## Run

```bash
python3 server.py
# then open http://127.0.0.1:8905
```

Change the port/host at the bottom of `server.py` if needed.

## Use

Three input modes in the UI:
- **GitHub URL** — public repo, shallow-cloned read-only.
- **Zip upload** — drag-drop a `.zip`/`.tar.gz` of the codebase.
- **Local path** — a folder on the same machine (scanned read-only).

The tool walks the repo (skipping `node_modules`, `.git`, `venv`, data/transcript dirs…),
prioritizes task/tool/harness/world/scorer files into a size-capped digest, sends it to the
model, and renders the two verdicts. A full audit is usually 20–60 s.

## Files

| file | role |
|------|------|
| `auditor.py` | file collection, digest, prompt/rubric, model routing (API + CLI fallback) |
| `server.py`  | FastAPI app: `/api/audit`, `/api/job/{id}`, `/api/upload`, serves the UI |
| `static/index.html` · `style.css` · `app.js` | the single-page UI (light-orange theme, scan animation) |
| `requirements.txt` | Python deps |

Nothing is written outside `setup_auditor/_work/` (temp clones/uploads), and local paths are
only read, never modified.
