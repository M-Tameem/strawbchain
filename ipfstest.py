import requests
import datetime
import base64

# Create dummy file
dummy_file_name = "my_test_ipfs_file.txt"
with open(dummy_file_name, "w") as f:
    f.write(f"Hello IPFS from Kaleido! Uploaded at {datetime.datetime.now()}\n")

# Upload to IPFS
APP_CRED_IPFS = "u0lq762io0:Ez4rJ3Yw4FVhbT6RP0YTx8Ki-rWBKrIRkVh2G4zvPe0"
IPFS_API_URL_BASE = "https://u0n7pgi2z4-u0vc4betx1-ipfs.us0-aws.kaleido.io"
add_url = f"{IPFS_API_URL_BASE}/api/v0/add"

with open(dummy_file_name, "rb") as file_to_upload:
    files = {
        'file': (dummy_file_name, file_to_upload)
    }
    headers = {
        "Authorization": f"Basic {base64.b64encode(APP_CRED_IPFS.encode()).decode()}"
    }
    response = requests.post(add_url, files=files, headers=headers, verify=False)

    if response.ok:
        print("Upload success.")
        print(response.text)
    else:
        print(f"Error: {response.status_code}")
        print(response.text)
