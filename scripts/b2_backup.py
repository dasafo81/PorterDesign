#!/usr/bin/env python3
"""Upload the encrypted backup to Backblaze B2 and round-trip it locally.

The script deliberately never writes to Supabase.  It uploads one encrypted
object, downloads that exact object again, and verifies its SHA-1 checksum.
"""

import base64
import hashlib
import json
import os
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
    bucket_id = os.environ["B2_BUCKET_ID"]
    bucket_name = os.environ["B2_BUCKET_NAME"]
    source = os.environ["BACKUP_FILE"]
    file_name = os.environ.get("B2_FILE_NAME") or (
        "supabase/" + os.environ["GITHUB_REPOSITORY"] + "/"
        + os.environ.get("GITHUB_RUN_ID", "manual") + "/backup.tar.gz.gpg"
    )

    basic = base64.b64encode((key_id + ":" + app_key).encode()).decode()
    auth = api("GET", "https://api.backblazeb2.com/b2api/v2/b2_authorize_account",
               headers={"Authorization": "Basic " + basic})
    api_url = auth["apiUrl"]
    token = auth["authorizationToken"]
    upload = api("POST", api_url + "/b2api/v2/b2_get_upload_url", token,
                 {"bucketId": bucket_id})

    with open(source, "rb") as handle:
        data = handle.read()
    digest = hashlib.sha1(data).hexdigest()
    encoded_name = urllib.parse.quote(file_name, safe="")
    req = urllib.request.Request(
        upload["uploadUrl"], data, method="POST",
        headers={
            "Authorization": upload["authorizationToken"],
            "X-Bz-File-Name": encoded_name,
            "Content-Type": "application/octet-stream",
            "Content-Length": str(len(data)),
            "X-Bz-Content-Sha1": digest,
            "X-Bz-Info-src_bucket": bucket_name,
        },
    )
    with urllib.request.urlopen(req, timeout=120) as response:
        result = json.load(response)
    if result.get("bucketId") != bucket_id or result.get("contentSha1") != digest:
        raise SystemExit("B2 upload checksum or bucket verification failed")
    print(json.dumps({"fileName": result["fileName"], "contentSha1": digest}))


if __name__ == "__main__":
    main()
