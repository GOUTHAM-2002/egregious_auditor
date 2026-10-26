"""Setup Auditor web server (FastAPI). Serves the UI and runs audits in background threads."""
import threading
import time
import uuid
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import auditor

HERE = Path(__file__).parent
STATIC = HERE / "static"
UPLOADS = HERE / "_work" / "uploads"
UPLOADS.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Setup Auditor")
JOBS = {}
LOCK = threading.Lock()


class AuditReq(BaseModel):
    source_type: str   # github | local | zip
    value: str


def _runner(job_id: str, source_type: str, value: str):
    def log(msg):
        with LOCK:
            JOBS[job_id]["log"].append({"t": round(time.time(), 2), "msg": str(msg)})
    try:
        with LOCK:
            JOBS[job_id]["state"] = "running"
        result = auditor.run_audit(source_type, value, log)
        with LOCK:
            JOBS[job_id]["state"] = "done"
            JOBS[job_id]["result"] = result
    except Exception as e:
        log(f"ERROR: {e}")
        with LOCK:
            JOBS[job_id]["state"] = "error"
            JOBS[job_id]["error"] = str(e)


@app.post("/api/upload")
async def upload(file: UploadFile = File(...)):
    token = uuid.uuid4().hex[:12]
    dest = UPLOADS / f"{token}_{Path(file.filename).name}"
    data = await file.read()
    dest.write_bytes(data)
    return {"path": str(dest)}


@app.post("/api/audit")
def start_audit(req: AuditReq):
    if req.source_type not in ("github", "local", "zip"):
        raise HTTPException(400, "bad source_type")
    if not req.value.strip():
        raise HTTPException(400, "empty value")
    job_id = uuid.uuid4().hex[:12]
    with LOCK:
        JOBS[job_id] = {"state": "queued", "log": [], "result": None, "error": None,
                        "created": time.time(), "source": {"type": req.source_type, "value": req.value}}
    threading.Thread(target=_runner, args=(job_id, req.source_type, req.value), daemon=True).start()
    return {"job_id": job_id}


@app.get("/api/job/{job_id}")
def job(job_id: str):
    with LOCK:
        j = JOBS.get(job_id)
        if not j:
            raise HTTPException(404, "no such job")
        return JSONResponse(j)


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")


app.mount("/static", StaticFiles(directory=STATIC), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8905, log_level="warning")
