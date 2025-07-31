#!/usr/bin/env python3
"""
Foodtrace – FOCUSED FUNCTIONAL TEST
======================================================================
This script drives core business logic functions in **FoodtraceSmartContract**.
It handles Kaleido identity enrollment and then registers identities with the
chaincode using their actual Full X.509 IDs.
"""

from __future__ import annotations
import urllib.request, json, time, datetime, base64, ssl, sys, uuid
from typing import Any, Dict, List, Optional, Union
from datetime import timezone # Import timezone for UTC

# --- CONFIGURATION ---
KALEIDO_RUNTIME_HOSTNAME = "u0n7pgi2z4-u0lbsjef4v-connect.us0-aws-ws.kaleido.io" # From your API Gateway URL
APP_CRED = "u0lq762io0:Ez4rJ3Yw4FVhbT6RP0YTx8Ki-rWBKrIRkVh2G4zvPe0" # From your App Cred Details

KALEIDO_API_GATEWAY_BASE_URL = f"https://{KALEIDO_RUNTIME_HOSTNAME}"
KALEIDO_IDENTITY_SERVICE_HOSTNAME = "u0n7pgi2z4-u0lbsjef4v-connect.us0-aws-ws.kaleido.io" # VERIFY THIS if different from runtime hostname
IDENTITY_URL = f"https://{KALEIDO_IDENTITY_SERVICE_HOSTNAME}/identities" # APP_CRED is NOT embedded here, handled by _req

CHANNEL_NAME = "default-channel"
CHAINCODE_NAME = "banana" # You mentioned this changed from "organichain"

ENABLE_ENROLLMENT = True
# --- END CONFIGURATION ---

CONNECT_URL = f"{KALEIDO_API_GATEWAY_BASE_URL}/transactions"
QUERY_URL = f"{KALEIDO_API_GATEWAY_BASE_URL}/query"

LOG_FILE = "foodtrace_focused_test_log.txt"
BASE_SHIPMENT_ID = f"SHIP{datetime.datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}"

PLACEHOLDER_STRING = "N/A_TestValue"
PLACEHOLDER_HASH = "0xTestHash0123456789abcdef0123456789abcdef0123456789abcdef012345"
PLACEHOLDER_URL = "http://example.com/test_resource"
PLACEHOLDER_DATE = datetime.datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

ID_ROSTER: Dict[str, Dict[str, Union[str, None]]] = {
    "admin_main_tester": {"alias": "MainAdminFT", "role": "admin"},
    "farmer_alice_tester": {"alias": "AliceAcres", "role": "farmer"},
    "processor_bob_tester": {"alias": "BobProcessing", "role": "processor"},
    "processor_charlie_tester": {"alias": "CharlieTransform", "role": "processor"},
    "distributor_dave_tester": {"alias": "DaveDistribution", "role": "distributor"},
    "retailer_eve_tester": {"alias": "EveMart", "role": "retailer"},
    "certifier_frank_tester": {"alias": "FrankCertify", "role": "certifier"},
    "auditor_grace_tester": {"alias": "GraceAudits", "role": "admin"},
}

SECRETS: Dict[str, str] = {}
method_type = "invoke" # Global to help ok() function

actual_full_ids: Dict[str, str] = {} # Global to store kid_name -> actual FullID

def _req(url: str, payload: Optional[dict] = None, *, method: str = "POST") -> Dict[str, Any]:
    # APP_CRED is used here for the Authorization header
    auth = base64.b64encode(APP_CRED.encode()).decode()
    headers = {"Content-Type": "application/json", "Authorization": f"Basic {auth}"}
    data = json.dumps(payload).encode() if payload is not None else None
    # SSL context for disabling verification (common in dev/test with Kaleido)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE
    try:
        with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=headers, method=method), context=context, timeout=90) as r:
            body = r.read().decode() if r.length is None or r.length > 0 else "" # type: ignore
            out: Dict[str, Any] = {"status": r.getcode()}
            if body:
                try:
                    out.update(json.loads(body))
                except json.JSONDecodeError:
                    out["raw"] = body
            return out
    except urllib.error.HTTPError as e:
        raw = e.read().decode(errors="ignore") if e.fp else ""
        try:
            details = json.loads(raw) if raw and "<html" not in raw and "{" in raw else {"raw": raw, "note": "Response not valid JSON or HTML."}
        except json.JSONDecodeError:
            details = {"raw": raw, "note": "Response could not be parsed as JSON."}
        return {"err": f"HTTP {e.code}", "details": details, "status": e.code}
    except Exception as exc:
        return {"err": str(exc), "status": 500}

def register_kaleido_identity(kid: str) -> bool:
    if not ENABLE_ENROLLMENT:
        log(f"Enrollment disabled - skipping Kaleido identity registration for: {kid}")
        return True
        
    log(f"Attempting to register Kaleido identity: {kid}")
    # IDENTITY_URL does not have embedded creds; _req handles auth header
    r = _req(IDENTITY_URL, {"name": kid, "type": "client"})
    if r.get("secret"):
        SECRETS[kid] = r["secret"]
        log(f"Kaleido identity {kid} registered successfully, secret stored.")
        return True
    if r.get("status") == 500 and isinstance(r.get("details"), dict):
        error_detail = r["details"].get("error", "")
        if "Identity" in error_detail and "is already registered" in error_detail:
            log(f"Kaleido identity {kid} is already registered with Kaleido. Proceeding to check/enroll.")
            g = _req(f"{IDENTITY_URL}/{kid}", method="GET")
            if g.get("status") == 200:
                log(f"Confirmed {kid} exists in Kaleido. Enrolled: {'yes' if g.get('enrollmentCert') else 'no'}")
                return True
            else:
                log(f"WARNING: Kaleido identity {kid} reported as existing, but failed to GET details: {g}")
                return False
    elif r.get("status") == 409 or ("already exists" in str(r.get("details", {}).get("error", "")).lower()):
        log(f"Kaleido identity {kid} likely already exists (409 or similar).")
        g = _req(f"{IDENTITY_URL}/{kid}", method="GET")
        if g.get("status") == 200:
            log(f"Confirmed {kid} exists. Enrolled: {'yes' if g.get('enrollmentCert') else 'no'}")
            return True
        else:
            log(f"WARNING: Kaleido identity {kid} reported as existing, but failed to GET details: {g}")
            return False
    log(f"ERROR: Failed to register Kaleido identity {kid}. Response: {r}")
    return False

def enroll_kaleido_identity(kid: str) -> bool:
    if not ENABLE_ENROLLMENT:
        log(f"Enrollment disabled - skipping Kaleido identity enrollment for: {kid}")
        return True
        
    log(f"Attempting to enroll Kaleido identity: {kid}")
    secret = SECRETS.get(kid)
    if not secret:
        log(f"No new secret found for {kid} from registration attempt. Checking current enrollment status.")
        g = _req(f"{IDENTITY_URL}/{kid}", method="GET")
        if g.get("status") == 200 and g.get("enrollmentCert"):
            log(f"Kaleido identity {kid} is already enrolled.")
            return True
        elif g.get("status") == 200:
            log(f"Kaleido identity {kid} exists but is not enrolled, and no new secret available for enrollment attempt.")
            return False
        else:
            log(f"ERROR: Could not get details for {kid} to check enrollment status: {g}")
            return False
    r = _req(f"{IDENTITY_URL}/{kid}/enroll", {"secret": secret})
    if r.get("status") in (200, 201):
        log(f"Kaleido identity {kid} enrolled successfully with provided secret.")
        return True
    log(f"ERROR: Failed to enroll Kaleido identity {kid} with secret. Response: {r}")
    return False

def get_kaleido_kid_for_alias(chaincode_alias: str) -> Optional[str]:
    for kid_name, data in ID_ROSTER.items():
        if data["alias"] == chaincode_alias:
            return kid_name
    log(f"WARNING: Could not find Kaleido kid_name for chaincode_alias '{chaincode_alias}' in ID_ROSTER.")
    return None

# get_full_id_for_alias (mock generator) is no longer the primary way to get FullIDs for registration.
# We will now use actual_full_ids populated by TestGetCallerIdentity.
# This function can be kept for debugging or specific mock scenarios if needed, but isn't used in the main flow.
# def get_full_id_for_alias(alias: str) -> str:
# """Generate a mock full ID for testing purposes"""
# return f"x509::{alias}::OU=client::CN={alias}"

def invoke(chaincode_alias_for_signer: str, func: str, args: List[Any]):
    global method_type
    method_type = "invoke"
    str_args = [str(arg) if not isinstance(arg, str) else arg for arg in args]

    kaleido_kid_to_sign_with = get_kaleido_kid_for_alias(chaincode_alias_for_signer)
    if not kaleido_kid_to_sign_with:
        log(f"CRITICAL ERROR: Could not find Kaleido kid_name for chaincode_alias_for_signer '{chaincode_alias_for_signer}' in ID_ROSTER for invoke.")
        return {"err": f"Signer alias {chaincode_alias_for_signer} not found in ID_ROSTER", "status": 0}

    payload = {
        "headers": {"signer": kaleido_kid_to_sign_with, "channel": CHANNEL_NAME, "chaincode": CHAINCODE_NAME},
        "func": func,
        "args": str_args,
        "strongread": True # For invokes, this ensures it waits for commit, adjust if not desired
    }
    r = _req(CONNECT_URL, payload)
    # Enhanced logging
    if r.get("details") and isinstance(r["details"], dict) and ("error" in r["details"] or "message" in r["details"]):
        error_message = r["details"].get("error", "") or r["details"].get("message", "")
        if "chaincode response" in error_message.lower() or \
           "transaction returned with failure" in error_message.lower() or \
           "Description: " in error_message: # Catch chaincode errors
            log(f"TX '{func}' by {kaleido_kid_to_sign_with}({chaincode_alias_for_signer}) -> CHAINCODE ERROR: {r['details']}")
        else:
            log(f"TX '{func}' by {kaleido_kid_to_sign_with}({chaincode_alias_for_signer}) -> KALEIDO RESPONSE: Status {r.get('status')}, Details: {r.get('details')}")
    elif r.get("status") not in [202, 'VALID', 'valid']: # 202 is typical success for async Kaleido invoke, 'VALID' for committed
        if not (isinstance(r.get("status"), str) and r.get("status","").upper() == 'VALID'): # Check if it's not VALID string before logging as unexpected
             log(f"TX '{func}' by {kaleido_kid_to_sign_with}({chaincode_alias_for_signer}) -> UNEXPECTED HTTP Status {r.get('status')}, Full: {r}")
    else: # HTTP 202 or status 'VALID'
        log(f"TX '{func}' by {kaleido_kid_to_sign_with}({chaincode_alias_for_signer}) -> Sent/Committed ({r.get('status')}), Receipt/ID: {r.get('receipt') or r.get('id') or r.get('transactionID', 'N/A')}")
    return r

def query(chaincode_alias_for_signer: str, func: str, args: List[Any]):
    global method_type
    method_type = "query"
    str_args = [str(arg) if not isinstance(arg, str) else arg for arg in args]

    kaleido_kid_to_sign_with = get_kaleido_kid_for_alias(chaincode_alias_for_signer)
    if not kaleido_kid_to_sign_with:
        log(f"CRITICAL ERROR: Could not find Kaleido kid_name for chaincode_alias_for_signer '{chaincode_alias_for_signer}' in ID_ROSTER for query.")
        return {"err": f"Signer alias {chaincode_alias_for_signer} not found in ID_ROSTER", "status": 0}

    payload = {
        "headers": {"signer": kaleido_kid_to_sign_with, "channel": CHANNEL_NAME, "chaincode": CHAINCODE_NAME},
        "func": func,
        "args": str_args,
    }
    r = _req(QUERY_URL, payload)
    
    processed_result = None
    if r.get("status") == 200:
        if r.get("result") is not None:
            try:
                if isinstance(r["result"], str):
                    if r["result"].strip() == "":
                        processed_result = None # Or some indicator of empty success
                    else:
                        processed_result = json.loads(r["result"])
                else: # If Kaleido already parsed it (can happen)
                    processed_result = r["result"]
                log_detail_summary = "Successfully parsed." if processed_result is not None else "Empty result."
                log_detail = {"status": r.get("status"), "parsed_result_summary": log_detail_summary }
            except Exception as e:
                log(f"Warning: Could not JSON parse query result for '{func}': {e}. Raw result: {r['result']}")
                processed_result = r["result"] # Return raw if unparsable
                log_detail = {"status": r.get("status"), "raw_result_summary": "Returned raw due to parse error."}
        else: # No "result" field, but HTTP 200
            processed_result = None # Or some indicator of empty success
            log_detail = {"status": r.get("status"), "note": "No 'result' field in HTTP 200 response"}
    else: # Not HTTP 200
        log_detail = r # Log the full error response
        # processed_result remains None or the error structure from _req

    log(f"Q '{func}' by {kaleido_kid_to_sign_with}({chaincode_alias_for_signer}): {log_detail}")
    # Return the processed result if successful and parsed, otherwise the full response from _req (which includes error details)
    return processed_result if (r.get("status") == 200 and processed_result is not None) else r


def ok(r: Dict[str, Any], expected_status_codes: Optional[List[int]] = None) -> bool:
    global method_type
    if expected_status_codes is None:
        if method_type == "invoke":
            expected_status_codes = [202] # Default async success
        else:  # query
            expected_status_codes = [200]

    status = r.get("status")

    # Handle 'VALID' string status for successful invokes (primary success indicator from Kaleido for committed tx)
    if method_type == "invoke" and isinstance(status, str) and status.upper() == "VALID":
        log(f"DEBUG ok(): Received 'VALID' status for invoke, treating as success. Response: {r.get('transactionID', r.get('id'))}")
        return True

    if isinstance(status, int) and status in expected_status_codes:
        # For invokes, if we got HTTP 202, it means accepted, but not yet confirmed 'VALID'.
        # For queries, HTTP 200 is direct success.
        if method_type == "query" and status == 200:
             # Further check for chaincode error embedded in HTTP 200 for queries
            if r.get("details") and isinstance(r["details"], dict):
                error_msg = r["details"].get("error", "") or r["details"].get("message", "")
                if "Description: " in error_msg or "chaincode response" in error_msg.lower():
                    log(f"DEBUG ok(): Query HTTP 200 but chaincode-level error indicated. Message: {error_msg}")
                    return False # It's an error despite HTTP 200
            # For queries, also handle cases where 'result' might be missing but it's a valid empty response
            if "result" not in r and not (r.get("raw") == "" or (not r.get("details") and len(r) <= 2)): # type: ignore
                 log(f"DEBUG ok(): Query HTTP 200 but 'result' field missing and not a clear empty response. Response: {r}")
                 # This might be an issue depending on expected behavior for the query
                 # For now, let's be strict: if it's 200 and not clearly empty, 'result' should be there.
                 # However, the query function already handles parsing `result` and returns the full `r` on error.
                 # So, if `query` returned `r` and status is 200, but result parsing failed in `query`,
                 # `ok(r)` here will still pass if `status` is 200. The caller of `ok` needs to check content.
            return True # Passed HTTP code check

        if method_type == "invoke" and status == 202: # Async accepted
            log(f"DEBUG ok(): Invoke HTTP 202 (Accepted). Caller should check for 'VALID' later if synchronous confirmation needed.")
            return True
    
    # If we reach here, it means status didn't match expected HTTP codes and wasn't 'VALID' for invoke
    log(f"DEBUG ok(): Status {status} (type: {type(status)}) not in expected {expected_status_codes} and not 'VALID' for invoke. Response: {r}")
    # Check for embedded chaincode errors if HTTP status was unexpected (e.g., 500, 400)
    if r.get("details") and isinstance(r["details"], dict):
        error_msg = r["details"].get("error", "") or r["details"].get("message", "")
        if "Description: " in error_msg or "chaincode response" in error_msg.lower():
            log(f"DEBUG ok(): Chaincode-level error indicated in details. Message: {error_msg}")
            # Fall through to return False
    return False


def log(msg: str):
    timestamp = datetime.datetime.now(timezone.utc).isoformat()
    console_timestamp = datetime.datetime.now(timezone.utc).strftime("%H:%M:%S")
    full_log_line = f"[{timestamp}] {msg}\n"
    console_log_line = f"[{console_timestamp}] {msg}"
    try:
        with open(LOG_FILE, "a") as f:
            f.write(full_log_line)
    except Exception as e:
        print(f"Log file write error: {e}")
    print(console_log_line)

def step(t: str):
    bar = "=" * (len(t) + 4)
    print(f"\n{bar}\n| {t} |\n{bar}") # type: ignore
    log(f"STEP: {t}")
    time.sleep(1)

def get_current_utc_timestamp():
    return datetime.datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

def main():
    global method_type
    global actual_full_ids # Ensure it's accessible
    open(LOG_FILE, "w").write(f"Foodtrace FOCUSED FUNCTIONAL Test Run - {datetime.datetime.now(timezone.utc).isoformat()}\n")

    if ENABLE_ENROLLMENT:
        step("Ensure Kaleido Identities are Registered & Enrolled")
        identities_fully_ready = True
        for kid_name_in_roster in ID_ROSTER:
            if not register_kaleido_identity(kid_name_in_roster):
                log(f"WARNING: Registration check for Kaleido identity {kid_name_in_roster} reported issues.")
            if not enroll_kaleido_identity(kid_name_in_roster):
                log(f"ERROR: Crucial enrollment failed for Kaleido identity {kid_name_in_roster}. This identity may not be usable.")
                identities_fully_ready = False
            time.sleep(0.5)

        if not identities_fully_ready:
            log("FATAL: One or more Kaleido identities could not be confirmed as enrolled. Exiting.")
            sys.exit(1)
        log("All Kaleido identities checked and confirmed enrolled.")
    else:
        step("Skipping Kaleido Identity Registration & Enrollment (ENABLE_ENROLLMENT=False)")
        log("Assuming all Kaleido identities are already registered and enrolled.")

    step("Retrieve Actual Full X.509 IDs from Chaincode")
    all_full_ids_retrieved = True
    for kid_name, data_val in ID_ROSTER.items(): # Renamed data to data_val to avoid conflict
        chaincode_alias_for_kid = str(data_val["alias"])
        log(f"Querying TestGetCallerIdentity as Kaleido identity: {kid_name} (using its alias {chaincode_alias_for_kid} for lookup)")
        method_type = "query"
        
        response = query(chaincode_alias_for_kid, "TestGetCallerIdentity", [])
        
        # Check response structure for TestGetCallerIdentity
        if isinstance(response, dict) and response.get("fullId") and not response.get("fullId","").startswith("ERROR"):
            actual_full_ids[kid_name] = response["fullId"]
            log(f"Successfully retrieved FullID for {kid_name} ({chaincode_alias_for_kid}): {actual_full_ids[kid_name]}")
        else:
            log(f"ERROR: Failed to retrieve FullID for {kid_name} ({chaincode_alias_for_kid}). Response: {response}")
            log(f"Ensure 'TestGetCallerIdentity' is deployed and accessible by {kid_name}.")
            all_full_ids_retrieved = False
        time.sleep(1)

    if not all_full_ids_retrieved:
        log("FATAL: Could not retrieve all necessary actual FullIDs. Exiting.")
        sys.exit(1)
    log("All actual Full X.509 IDs retrieved.")


    step("Bootstrap Chaincode and Register Identities")

    admin_kid_name = "admin_main_tester"
    admin_chaincode_alias = str(ID_ROSTER[admin_kid_name]["alias"])
    admin_actual_full_id = actual_full_ids.get(admin_kid_name)

    if not admin_actual_full_id:
        log(f"FATAL: Actual FullID for primary admin {admin_kid_name} not found. Exiting.")
        sys.exit(1)

    log(f"Attempting to pre-register primary admin '{admin_kid_name}' ({admin_chaincode_alias}) with actual FullID '{admin_actual_full_id}'")
    try:
        method_type = "invoke"
        # The signer for this first RegisterIdentity can be itself if no admins exist.
        reg_admin_result = invoke(admin_chaincode_alias, "RegisterIdentity", [admin_actual_full_id, admin_chaincode_alias, admin_chaincode_alias])
        if ok(reg_admin_result):
            log(f"Primary admin identity '{admin_chaincode_alias}' pre-registered/updated with actual FullID.")
        else:
            error_msg_detail = ""
            if isinstance(reg_admin_result.get("details"), dict):
                error_msg_detail = reg_admin_result["details"].get("error", "") or reg_admin_result["details"].get("message", "")
            
            if "already in use by identity" in error_msg_detail and admin_actual_full_id in error_msg_detail :
                 log(f"Primary admin identity '{admin_chaincode_alias}' (FullID: {admin_actual_full_id}) already registered. Proceeding.")
            elif "shortName (alias)" in error_msg_detail and "is already in use" in error_msg_detail:
                log(f"Warning: Alias '{admin_chaincode_alias}' already in use. If not by {admin_actual_full_id}, this could be an issue. Response: {reg_admin_result}")
            else:
                log(f"Failed to pre-register/update primary admin '{admin_chaincode_alias}'. Response: {reg_admin_result}")
        time.sleep(2)
    except Exception as e:
        log(f"Error pre-registering primary admin {admin_chaincode_alias}: {e}")

    try:
        method_type = "invoke"
        log(f"Attempting BootstrapLedger, signed by {admin_kid_name} ({admin_chaincode_alias})")
        bootstrap_result = invoke(admin_chaincode_alias, "BootstrapLedger", [])
        if ok(bootstrap_result):
            log(f"Successfully bootstrapped system. Admin: {admin_chaincode_alias}")
        else:
            error_msg_detail = ""
            if isinstance(bootstrap_result.get("details"), dict):
                error_msg_detail = bootstrap_result["details"].get("error", "") or bootstrap_result["details"].get("message", "")
            if "system already has admins or is bootstrapped" in error_msg_detail:
                log(f"System already bootstrapped: {error_msg_detail}")
            else:
                log(f"BootstrapLedger failed. Response: {bootstrap_result}")
        time.sleep(2)
    except Exception as e:
        log(f"BootstrapLedger attempt failed: {e}")

    for kid_name, data_val in ID_ROSTER.items(): # Renamed data to data_val
        if kid_name == admin_kid_name:
            continue

        target_chaincode_alias = str(data_val["alias"])
        target_role = str(data_val["role"])
        target_actual_full_id = actual_full_ids.get(kid_name)

        if not target_actual_full_id:
            log(f"ERROR: Actual FullID for {kid_name} ({target_chaincode_alias}) not found. Skipping registration.")
            continue
        
        try:
            method_type = "invoke"
            log(f"Admin '{admin_chaincode_alias}' registering '{target_chaincode_alias}' with actual FullID '{target_actual_full_id}'")
            reg_result = invoke(admin_chaincode_alias, "RegisterIdentity", [target_actual_full_id, target_chaincode_alias, target_chaincode_alias])
            if ok(reg_result):
                log(f"Registered identity: {target_chaincode_alias} with actual FullID.")
            else:
                error_msg_detail = ""
                if isinstance(reg_result.get("details"), dict):
                    error_msg_detail = reg_result["details"].get("error", "") or reg_result["details"].get("message", "")
                if "already in use by identity" in error_msg_detail and target_actual_full_id in error_msg_detail:
                     log(f"Identity '{target_chaincode_alias}' (FullID: {target_actual_full_id}) already registered.")
                else:
                    log(f"Failed to register {target_chaincode_alias}. Response: {reg_result}")
                    # If registration failed for other reasons, skip role assignment
                    time.sleep(1)
                    continue 
            
            # Assign role regardless of whether it was newly registered or already existed
            method_type = "invoke"
            log(f"Admin '{admin_chaincode_alias}' assigning role '{target_role}' to '{target_chaincode_alias}'")
            role_result = invoke(admin_chaincode_alias, "AssignRoleToIdentity", [target_chaincode_alias, target_role])
            if ok(role_result):
                log(f"Assigned role '{target_role}' to {target_chaincode_alias}")
            else:
                log(f"Failed to assign role to {target_chaincode_alias}. Response: {role_result}")
            time.sleep(1)
        except Exception as e:
            log(f"Error processing identity {target_chaincode_alias}: {e}")

    auditor_kid_name = "auditor_grace_tester"
    if auditor_kid_name in ID_ROSTER and ID_ROSTER[auditor_kid_name]["role"] == "admin" and auditor_kid_name != admin_kid_name:
        grace_alias = str(ID_ROSTER[auditor_kid_name]["alias"])
        grace_actual_full_id = actual_full_ids.get(auditor_kid_name)

        if not grace_actual_full_id:
            log(f"ERROR: Actual FullID for secondary admin {auditor_kid_name} ({grace_alias}) not found. Skipping.")
        else:
            try:
                method_type = "invoke"
                log(f"Admin '{admin_chaincode_alias}' registering secondary admin '{grace_alias}' with actual FullID '{grace_actual_full_id}'")
                reg_grace_result = invoke(admin_chaincode_alias, "RegisterIdentity", [grace_actual_full_id, grace_alias, grace_alias])
                
                proceed_to_make_admin = False
                if ok(reg_grace_result):
                    log(f"Registered secondary admin: {grace_alias} with actual FullID.")
                    proceed_to_make_admin = True
                else:
                    error_msg_detail = ""
                    if isinstance(reg_grace_result.get("details"), dict):
                       error_msg_detail = reg_grace_result["details"].get("error", "") or reg_grace_result["details"].get("message", "")
                    if "already in use by identity" in error_msg_detail and grace_actual_full_id in error_msg_detail:
                        log(f"Secondary admin {grace_alias} (FullID: {grace_actual_full_id}) already registered.")
                        proceed_to_make_admin = True
                    else:
                        log(f"Failed to register secondary admin {grace_alias}. Response: {reg_grace_result}")

                if proceed_to_make_admin:
                    method_type = "invoke"
                    log(f"Admin '{admin_chaincode_alias}' making '{grace_alias}' an admin.")
                    make_admin_result = invoke(admin_chaincode_alias, "MakeIdentityAdmin", [grace_alias])
                    if ok(make_admin_result):
                        log(f"Made {grace_alias} an admin.")
                    else:
                        log(f"Failed to make {grace_alias} admin. Response: {make_admin_result}")
                time.sleep(1)
            except Exception as e:
                log(f"Error setting up admin {grace_alias}: {e}")
    
    log("Identity setup phase complete. Proceeding with admin sanity check...")

    step("Quick Admin Sanity Check (Admin queries own details by ALIAS)")
    method_type = "query"
    admin_details_check = query(admin_chaincode_alias, "GetIdentityDetails", [admin_chaincode_alias])

    if isinstance(admin_details_check, dict) and \
       admin_details_check.get("shortName") == admin_chaincode_alias and \
       admin_details_check.get("isAdmin") is True:
        # ok() might be too strict for query if it expects "result" field which GetIdentityDetails provides directly
        log(f"OK: Admin '{admin_chaincode_alias}' (signing as {admin_kid_name}) queried own details and is marked as admin on-chain. FullID: {admin_details_check.get('fullId')}")
    else:
        log(f"CRITICAL WARNING: Admin '{admin_chaincode_alias}' query for own details FAILED or not marked as admin. Response: {admin_details_check}")
        log(f"The on-chain state for '{admin_chaincode_alias}' (Expected Actual FullID: {admin_actual_full_id}) is NOT correctly configured. Subsequent tests WILL LIKELY FAIL.")

    step("End-to-End Shipment Lifecycle (SHIP001)")
    shipment_id_1 = BASE_SHIPMENT_ID + "_001"
    current_ts = get_current_utc_timestamp()
    
    farmer_chaincode_alias = str(ID_ROSTER["farmer_alice_tester"]["alias"])
    processor_bob_alias = str(ID_ROSTER["processor_bob_tester"]["alias"])
    certifier_frank_alias = str(ID_ROSTER["certifier_frank_tester"]["alias"])
    distributor_dave_alias = str(ID_ROSTER["distributor_dave_tester"]["alias"])
    retailer_eve_alias = str(ID_ROSTER["retailer_eve_tester"]["alias"])

    farmer_data_1 = {
        "farmerName": "Alice A.",
        "farmLocation": "Alice's Acres, Guelph, ON",
        "cropType": "Organic Strawberries",
        "plantingDate": (datetime.datetime.now(timezone.utc) - datetime.timedelta(days=90)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "harvestDate": current_ts,
        "farmingPractice": "Certified Organic",
        "fertilizerUsed": "Compost",
        "certificationDocumentHash": PLACEHOLDER_HASH,
        "destinationProcessorId": processor_bob_alias,
    }
    method_type = "invoke"
    res_cs = invoke(farmer_chaincode_alias, "CreateShipment", [shipment_id_1, "Organic Strawberries", "Premium Grade A", "250.5", "kg", json.dumps(farmer_data_1)])
    if not ok(res_cs): log(f"ERROR CreateShipment: {res_cs}")
    time.sleep(3)

    method_type = "query"
    ship_details_after_create = query(farmer_chaincode_alias, "GetShipmentPublicDetails", [shipment_id_1])
    if isinstance(ship_details_after_create, dict) and ship_details_after_create.get("id") == shipment_id_1:
        log(f"Shipment {shipment_id_1} created successfully. Status: {ship_details_after_create.get('status')}")
    else:
        log(f"FATAL ERROR: Shipment {shipment_id_1} not found or details incorrect after CreateShipment. Details: {ship_details_after_create}. Exiting subsequent tests.")
        sys.exit(1)
        
    method_type = "invoke"
    res_sfc = invoke(farmer_chaincode_alias, "SubmitForCertification", [shipment_id_1])
    if not ok(res_sfc): log(f"ERROR SubmitForCertification: {res_sfc}")
    time.sleep(3)

    method_type = "invoke"
    res_rc = invoke(certifier_frank_alias, "RecordCertification", [shipment_id_1, current_ts, "CertHashStrawberry001", "APPROVED", "Looks Good"])
    if not ok(res_rc): log(f"ERROR RecordCertification: {res_rc}")
    time.sleep(3)

    processor_data_1 = {
        "dateProcessed": current_ts,
        "processingType": "Washed and Packed",
        "processingLineId": "LineA-Organic",
        "processingLocation": "Bob's Processing Plant",
        "contaminationCheck": "PASS",
        "outputBatchId": "PROC-STRAW-001",
        "qualityCertifications": ["OrganicPackCertified", "FoodSafeLevel3"],
        "expiryDate": (datetime.datetime.now(timezone.utc) + datetime.timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "destinationDistributorId": distributor_dave_alias,
    }
    method_type = "invoke"
    res_ps = invoke(processor_bob_alias, "ProcessShipment", [shipment_id_1, json.dumps(processor_data_1)])
    if not ok(res_ps): log(f"ERROR ProcessShipment: {res_ps}")
    time.sleep(3)

    distributor_data_1 = {
        "pickupDateTime": current_ts,
        "deliveryDateTime": (datetime.datetime.now(timezone.utc) + datetime.timedelta(hours=6)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "distributionLineId": "RouteNorth77",
        "temperatureRange": "1-4°C",
        "storageTemperature": 2.5,
        "transitLocationLog": ["Warehouse A -> Hub B", "Hub B -> Dispatch Center C"],
        "transportConditions": "Refrigerated, Handle With Care",
        "distributionCenter": "GTA Central Hub",
        "destinationRetailerId": retailer_eve_alias,
    }
    method_type = "invoke"
    res_ds = invoke(distributor_dave_alias, "DistributeShipment", [shipment_id_1, json.dumps(distributor_data_1)])
    if not ok(res_ds): log(f"ERROR DistributeShipment: {res_ds}")
    time.sleep(3)

    retailer_data_1 = {
        "dateReceived": (datetime.datetime.now(timezone.utc) + datetime.timedelta(hours=6)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "retailerLineId": "ReceivingDock-3",
        "productNameRetail": "Fresh Organic Strawberries (500g pack)",
        "shelfLife": "5 days from receipt",
        "sellByDate": (datetime.datetime.now(timezone.utc) + datetime.timedelta(days=5, hours=6)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "retailerExpiryDate": (datetime.datetime.now(timezone.utc) + datetime.timedelta(days=6, hours=6)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "storeId": "EVE-001",
        "storeLocation": "123 Organic Lane, Cityville",
        "price": 5.99,
        "qrCodeLink": f"http://example.com/qr/{shipment_id_1}",
    }
    method_type = "invoke"
    res_rs = invoke(retailer_eve_alias, "ReceiveShipment", [shipment_id_1, json.dumps(retailer_data_1)])
    if not ok(res_rs): log(f"ERROR ReceiveShipment: {res_rs}")
    time.sleep(3)

    print(f"\n--- BASIC TEST COMPLETE ---")
    print(f"See {LOG_FILE} for detailed logs.")
    print(f"If enrollment was enabled, consider changing ENABLE_ENROLLMENT to False for subsequent runs to save time.")

if __name__ == "__main__":
    main()