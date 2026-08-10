#!/usr/bin/env python3
"""Non-destructive B2 restore drill: download, decrypt, and validate backup."""

import base64
import hashlib
import json
import os
import subprocess
import tarfile
import tempfile
import urllib.request
import urllib.parse


def api(method, url, token=None, payload=None, headers=None):
    body = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(url, body, method=method, headers=headers or {})
    if token:
        req.add_header("Authorization", token)
    with urllib.request.urlopen(req, timeout=60) as response:
        return json.load(response)


def main():
    key_id = os.environ["B2_APPLICATION_KEY_ID"]
    app_key = os.environ["B2_APPLICATION_KEY"]
    bucket_name = os.environ["B2_BUCKET_NAME"]
    file_name = os.environ["B2_FILE_NAME"]
    passphrase = os.environ["BACKUP_PASSPHRASE"]
    basic = base64.b64encode((key_id + ":" + app_key).encode()).decode()
    auth = api("GET", "https://api.backblazeb2.com/b2api/v2/b2_authorize_account",
               headers={"Authorization": "Basic " + basic})
    url = auth["downloadUrl"] + "/file/" + urllib.parse.quote(bucket_name, safe="")
    url += "/" + urllib.parse.quote(file_name, safe="/")

    with tempfile.TemporaryDirectory() as work:
        encrypted = os.path.join(work, "backup.tar.gz.gpg")
        archive = os.path.join(work, "backup.tar.gz")
        with urllib.request.urlopen(
            urllib.request.Request(url, headers={"Authorization": auth["authorizationToken"]}),
            timeout=120,
        ) as response, open(encrypted, "wb") as output:
            output.write(response.read())
        if os.path.getsize(encrypted) == 0:
            raise SystemExit("B2 restore download was empty")
        subprocess.run(
            ["gpg", "--batch", "--yes", "--pinentry-mode", "loopback",
             "--passphrase", passphrase, "--decrypt", "--output", archive, encrypted],
            check=True,
        )
        with tarfile.open(archive, "r:gz") as tar:
            members = [m for m in tar.getmembers() if m.isfile()]
            names = {m.name for m in members}
            if "backup/_summary.json" not in names:
                raise SystemExit("Restored archive has no backup/_summary.json")
            tar.extractall(work, filter="data")
        with open(os.path.join(work, "backup", "_summary.json"), encoding="utf-8") as handle:
            summary = json.load(handle)
        if summary.get("failed"):
            raise SystemExit("Restored backup summary contains failed tables")
        print(json.dumps({"fileName": file_name, "restoredFiles": len(members),
                          "sha256": hashlib.sha256(open(encrypted, "rb").read()).hexdigest()}))


if __name__ == "__main__":
    main()
