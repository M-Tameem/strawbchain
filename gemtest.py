#!/usr/bin/env python3
"""
Foodtrace – COMPREHENSIVE FUNCTIONAL TEST SCRIPT
======================================================================
This script drives core business logic functions in FoodtraceSmartContract.
It handles Kaleido identity enrollment, registers identities with the
chaincode using their actual Full X.509 IDs, and then attempts to
test all major functionalities.
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
IDENTITY_URL = f"https://{KALEIDO_IDENTITY_SERVICE_HOSTNAME}/identities"

CHANNEL_NAME = "default-channel"
CHAINCODE_NAME = "banana"

ENABLE_ENROLLMENT = True
# --- END CONFIGURATION ---

CONNECT_URL = f"{KALEIDO_API_GATEWAY_BASE_URL}/transactions"
QUERY_URL = f"{KALEIDO_API_GATEWAY_BASE_URL}/query"

LOG_FILE = "foodtrace_comprehensive_test_log.txt" # Changed log file name
BASE_SHIPMENT_ID = f"SHIP{datetime.datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}"

PLACEHOLDER_STRING = "N/A_TestValue"
PLACEHOLDER_HASH = "0xTestHash0123456789abcdef0123456789abcdef0123456789abcdef012345"
PLACEHOLDER_URL = "http://example.com/test_resource"
PLACEHOLDER_DATE = datetime.datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

ID_ROSTER: Dict[str, Dict[str, Union[str, None]]] = {
    "admin_main_tester": {"alias": "MainAdminFT", "role": "admin"}, # Role "admin" is conceptual for setup
    "farmer_alice_tester": {"alias": "AliceAcres", "role": "farmer"},
    "processor_bob_tester": {"alias": "BobProcessing", "role": "processor"},
    "processor_charlie_tester": {"alias": "CharlieTransform", "role": "processor"}, # For Transform
    "distributor_dave_tester": {"alias": "DaveDistribution", "role": "distributor"},
    "retailer_eve_tester": {"alias": "EveMart", "role": "retailer"},
    "certifier_frank_tester": {"alias": "FrankCertify", "role": "certifier"},
    "auditor_grace_tester": {"alias": "GraceAudits", "role": "admin"}, # Role "admin" is conceptual for setup
}

SECRETS: Dict[str, str] = {}
method_type = "invoke"
actual_full_ids: Dict[str, str] = {}

# ... (Keep _req, register_kaleido_identity, enroll_kaleido_identity, get_kaleido_kid_for_alias, invoke, query, ok, log, step, get_current_utc_timestamp functions exactly as in the last version that worked for you) ...
# [[ PASTE THE WORKING _req, register_kaleido_identity, enroll_kaleido_identity, get_kaleido_kid_for_alias, invoke, query, ok, log, step, get_current_utc_timestamp functions HERE ]]
# For brevity, I am omitting them here, but they are required from the previous version.
# Ensure the `ok` function handles `status: 'VALID'` as success for invokes.
# Ensure `_req` and URL constructions for IDENTITY_URL, CONNECT_URL, QUERY_URL are as per the version that fixed the "nonnumeric port" error.

# --- PASTE WORKING HELPER FUNCTIONS (from previous successful script) HERE ---
# Example:
def _req(url: str, payload: Optional[dict] = None, *, method: str = "POST") -> Dict[str, Any]:
    auth = base64.b64encode(APP_CRED.encode()).decode()
    headers = {"Content-Type": "application/json", "Authorization": f"Basic {auth}"}
    data = json.dumps(payload).encode() if payload is not None else None
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

def get_kaleido_kid_for_alias(chaincode_alias_for_signer: str) -> Optional[str]:
    for kid_name_local, data_local in ID_ROSTER.items(): # Use local var names
        if data_local["alias"] == chaincode_alias_for_signer:
            return kid_name_local
    log(f"WARNING: Could not find Kaleido kid_name for chaincode_alias_for_signer '{chaincode_alias_for_signer}' in ID_ROSTER.")
    return None

def invoke(chaincode_alias_for_signer: str, func: str, args: List[Any]):
    global method_type
    method_type = "invoke"
    str_args = [str(arg) if not isinstance(arg, (str, bytes)) else arg for arg in args] # Handle bytes if any later

    kaleido_kid_to_sign_with = get_kaleido_kid_for_alias(chaincode_alias_for_signer)
    if not kaleido_kid_to_sign_with:
        log(f"CRITICAL ERROR: Could not find Kaleido kid_name for chaincode_alias_for_signer '{chaincode_alias_for_signer}' in ID_ROSTER for invoke.")
        return {"err": f"Signer alias {chaincode_alias_for_signer} not found in ID_ROSTER", "status": 0}

    payload = {
        "headers": {"signer": kaleido_kid_to_sign_with, "channel": CHANNEL_NAME, "chaincode": CHAINCODE_NAME},
        "func": func,
        "args": str_args,
        "strongread": True
    }
    r = _req(CONNECT_URL, payload)
    log_msg_prefix = f"TX '{func}' by {kaleido_kid_to_sign_with}({chaincode_alias_for_signer})"
    if isinstance(r.get("details"), dict) and ("error" in r["details"] or "message" in r["details"]):
        error_message = r["details"].get("error", "") or r["details"].get("message", "")
        if "chaincode response" in error_message.lower() or \
           "transaction returned with failure" in error_message.lower() or \
           "Description: " in error_message:
            log(f"{log_msg_prefix} -> CHAINCODE ERROR: {r['details']}")
        else:
            log(f"{log_msg_prefix} -> KALEIDO RESPONSE: Status {r.get('status')}, Details: {r.get('details')}")
    elif not (isinstance(r.get("status"), str) and r.get("status","").upper() == 'VALID') and r.get("status") != 202 :
        log(f"{log_msg_prefix} -> UNEXPECTED HTTP Status {r.get('status')}, Full: {r}")
    else:
        tx_id = r.get('transactionID') or r.get('id') or r.get('receipt') or 'N/A'
        log(f"{log_msg_prefix} -> Sent/Committed ({r.get('status')}), TX_ID/Receipt: {tx_id}")
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
    
    processed_result: Any = None # Allow Any type for processed_result
    log_detail_message = ""

    if r.get("status") == 200:
        if "result" in r and r["result"] is not None: # Check if "result" key exists and is not None
            try:
                if isinstance(r["result"], str):
                    if r["result"].strip() == "":
                        processed_result = None 
                        log_detail_message = "Successfully queried, empty result string."
                    else:
                        processed_result = json.loads(r["result"])
                        log_detail_message = "Successfully parsed JSON result."
                else: 
                    processed_result = r["result"]
                    log_detail_message = "Result was already parsed (not a string)."
            except json.JSONDecodeError as e:
                log(f"Warning: Could not JSON parse query result for '{func}': {e}. Raw result: {r['result']}")
                processed_result = r["result"] 
                log_detail_message = "Returned raw result due to JSON parse error."
            except Exception as e: # Catch any other parsing errors
                log(f"Warning: Unexpected error parsing query result for '{func}': {e}. Raw result: {r['result']}")
                processed_result = r["result"]
                log_detail_message = "Returned raw result due to unexpected parse error."
        else: # HTTP 200 but no "result" field or "result" is None
            processed_result = None 
            log_detail_message = "Successfully queried, no 'result' field or result is null."
        
        log_detail_for_print = {"status": r.get("status"), "summary": log_detail_message}
    else: 
        log_detail_for_print = r 
        # If not 200, processed_result remains None, and `r` (which contains error details) is effectively returned by the logic below

    log(f"Q '{func}' by {kaleido_kid_to_sign_with}({chaincode_alias_for_signer}): {log_detail_for_print}")
    
    # Return the structured data if successfully processed, else return the full response dict `r` which includes errors
    return processed_result if (r.get("status") == 200 and processed_result is not None) else r


def ok(r: Dict[str, Any], expected_status_codes: Optional[List[int]] = None) -> bool:
    global method_type
    if expected_status_codes is None:
        if method_type == "invoke":
            expected_status_codes = [202] 
        else:
            expected_status_codes = [200]

    status = r.get("status")

    if method_type == "invoke" and isinstance(status, str) and status.upper() == "VALID":
        log(f"DEBUG ok(): Received 'VALID' status for invoke, treating as success. TX_ID: {r.get('transactionID', r.get('id', 'N/A'))}")
        return True

    if isinstance(status, int) and status in expected_status_codes:
        if method_type == "query" and status == 200:
            # For queries, HTTP 200 is good, but still check for embedded chaincode errors
            # The `query` function itself now returns the error dict `r` if parsing fails or status isn't 200
            # So, if we reach here with status 200, it implies _req was successful.
            # The actual content check should be done by the caller of ok() on the result of query().
            # However, if `r` still contains an `err` key from `_req` (e.g. HTTP 500 from gateway but parsed by query),
            # then it's an error.
            if r.get("err"): # If _req returned an error structure
                 log(f"DEBUG ok(): Query HTTP 200 but _req indicated an error structure. Response: {r}")
                 return False
            # If Kaleido wraps a chaincode error in a 200 OK for query (less common but possible with some gateways)
            if isinstance(r.get("result"), str) and ("Description: " in r.get("result") or "chaincode response" in r.get("result","").lower()):
                 log(f"DEBUG ok(): Query HTTP 200 but 'result' field contains chaincode error string. Result: {r.get('result')}")
                 return False
            return True

        if method_type == "invoke" and status == 202:
            log(f"DEBUG ok(): Invoke HTTP 202 (Accepted). Caller should ideally check for 'VALID' status via other means if synchronous confirmation is critical.")
            return True
            
    # If status didn't match expected HTTP codes and wasn't 'VALID' for invoke
    # Also check for chaincode errors embedded in the details, even if HTTP status was initially "ok" by some other path.
    if isinstance(r.get("details"), dict):
        error_msg = r["details"].get("error", "") or r["details"].get("message", "")
        if "Description: " in error_msg or "chaincode response" in error_msg.lower():
            log(f"DEBUG ok(): Chaincode-level error explicitly found in details. Message: {error_msg}. Full Response: {r}")
            return False # Definitely a chaincode error

    log(f"DEBUG ok(): Status {status} (type: {type(status)}) not in expected {expected_status_codes} and not 'VALID' for invoke. Response: {r}")
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
    time.sleep(1) # Reduced sleep to 1 for faster comprehensive tests

def get_current_utc_timestamp():
    return datetime.datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

# --- END OF PASTED HELPER FUNCTIONS ---


def main():
    global method_type
    global actual_full_ids
    open(LOG_FILE, "w").write(f"Foodtrace COMPREHENSIVE Test Run - {datetime.datetime.now(timezone.utc).isoformat()}\n")

    # --- Phase 1: Kaleido Identity Enrollment ---
    if ENABLE_ENROLLMENT:
        step("Ensure Kaleido Identities are Registered & Enrolled")
        # ... (this part is identical to your last working script, keep it) ...
        identities_fully_ready = True
        for kid_name_in_roster in ID_ROSTER:
            if not register_kaleido_identity(kid_name_in_roster):
                log(f"WARNING: Registration check for Kaleido identity {kid_name_in_roster} reported issues.")
            if not enroll_kaleido_identity(kid_name_in_roster):
                log(f"ERROR: Crucial enrollment failed for Kaleido identity {kid_name_in_roster}. This identity may not be usable.")
                identities_fully_ready = False
            time.sleep(0.2) # Reduced sleep

        if not identities_fully_ready:
            log("FATAL: One or more Kaleido identities could not be confirmed as enrolled. Exiting.")
            sys.exit(1)
        log("All Kaleido identities checked and confirmed enrolled.")
    else:
        step("Skipping Kaleido Identity Registration & Enrollment (ENABLE_ENROLLMENT=False)")
        log("Assuming all Kaleido identities are already registered and enrolled.")

    # --- Phase 2: Retrieve Actual Full X.509 IDs ---
    step("Retrieve Actual Full X.509 IDs from Chaincode")
    # ... (this part is identical to your last working script, keep it) ...
    all_full_ids_retrieved = True
    for kid_name, data_val in ID_ROSTER.items():
        chaincode_alias_for_kid = str(data_val["alias"])
        log(f"Querying TestGetCallerIdentity as Kaleido identity: {kid_name} (using its alias {chaincode_alias_for_kid} for lookup)")
        method_type = "query"
        response = query(chaincode_alias_for_kid, "TestGetCallerIdentity", [])
        if isinstance(response, dict) and response.get("fullId") and not response.get("fullId","").startswith("ERROR"):
            actual_full_ids[kid_name] = response["fullId"]
            log(f"Successfully retrieved FullID for {kid_name} ({chaincode_alias_for_kid}): {actual_full_ids[kid_name]}")
        else:
            log(f"ERROR: Failed to retrieve FullID for {kid_name} ({chaincode_alias_for_kid}). Response: {response}")
            all_full_ids_retrieved = False
        time.sleep(0.2) # Reduced sleep

    if not all_full_ids_retrieved:
        log("FATAL: Could not retrieve all necessary actual FullIDs. Exiting.")
        sys.exit(1)
    log("All actual Full X.509 IDs retrieved.")

    # --- Phase 3: Bootstrap Chaincode and Register/Configure Identities ---
    step("Bootstrap Chaincode and Register/Configure Identities")
    # ... (this part is identical to your last working script, keep it, including admin pre-registration, bootstrap, other identity registration, role assignment, and secondary admin setup) ...
    # ... Ensure it uses `actual_full_ids` for registrations ...
    # ... Ensure it skips assigning "admin" as a role via AssignRoleToIdentity ...
    admin_kid_name = "admin_main_tester" 
    admin_chaincode_alias = str(ID_ROSTER[admin_kid_name]["alias"]) 
    admin_actual_full_id = actual_full_ids.get(admin_kid_name)

    if not admin_actual_full_id:
        log(f"FATAL: Actual FullID for primary admin {admin_kid_name} not found. Exiting.")
        sys.exit(1)

    log(f"Attempting to pre-register primary admin '{admin_kid_name}' ({admin_chaincode_alias}) with actual FullID '{admin_actual_full_id}'")
    try:
        method_type = "invoke"
        reg_admin_result = invoke(admin_chaincode_alias, "RegisterIdentity", [admin_actual_full_id, admin_chaincode_alias, admin_chaincode_alias])
        if ok(reg_admin_result):
            log(f"Primary admin identity '{admin_chaincode_alias}' pre-registered/updated with actual FullID.")
        else:
            error_msg_detail = ""
            if isinstance(reg_admin_result.get("details"), dict):
                error_msg_detail = reg_admin_result["details"].get("error", "") or reg_admin_result["details"].get("message", "")
            if "already in use by identity" in error_msg_detail and admin_actual_full_id in error_msg_detail :
                 log(f"Primary admin identity '{admin_chaincode_alias}' (FullID: {admin_actual_full_id}) already registered. Proceeding.")
            elif "shortName (alias)" in error_msg_detail and "is already in use" in error_msg_detail: # This case means alias is used by a *different* fullID
                log(f"CRITICAL WARNING: Alias '{admin_chaincode_alias}' is already in use by a DIFFERENT identity. This indicates stale state from a previous run with mock IDs. Please reset chaincode state (redeploy chaincode) for accurate testing. Response: {reg_admin_result}")
                sys.exit(1) # Exit if admin alias is taken by a mock ID.
            else:
                log(f"Failed to pre-register/update primary admin '{admin_chaincode_alias}'. Response: {reg_admin_result}")
        time.sleep(1)
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
                log(f"System already bootstrapped: {error_msg_detail}") # This is OK for reruns
            else:
                log(f"BootstrapLedger failed. Response: {bootstrap_result}") # Could be an issue
        time.sleep(1)
    except Exception as e:
        log(f"BootstrapLedger attempt failed: {e}")

    for kid_name, data_val in ID_ROSTER.items():
        if kid_name == admin_kid_name:
            continue
        target_chaincode_alias = str(data_val["alias"])
        target_role = str(data_val["role"]) if data_val["role"] else None # Handle None role for admins
        target_actual_full_id = actual_full_ids.get(kid_name)

        if not target_actual_full_id:
            log(f"ERROR: Actual FullID for {kid_name} ({target_chaincode_alias}) not found. Skipping registration.")
            continue
        
        try:
            method_type = "invoke"
            log(f"Admin '{admin_chaincode_alias}' registering '{target_chaincode_alias}' with actual FullID '{target_actual_full_id}'")
            reg_result = invoke(admin_chaincode_alias, "RegisterIdentity", [target_actual_full_id, target_chaincode_alias, target_chaincode_alias])
            
            can_assign_role = False
            if ok(reg_result):
                log(f"Registered identity: {target_chaincode_alias} with actual FullID.")
                can_assign_role = True
            else:
                error_msg_detail = ""
                if isinstance(reg_result.get("details"), dict):
                    error_msg_detail = reg_result["details"].get("error", "") or reg_result["details"].get("message", "")
                
                if "shortName (alias)" in error_msg_detail and f"is already in use by identity '{target_actual_full_id}'" in error_msg_detail:
                     log(f"Identity '{target_chaincode_alias}' (FullID: {target_actual_full_id}) already registered with this alias and correct FullID.")
                     can_assign_role = True
                elif "shortName (alias)" in error_msg_detail and "is already in use by identity" in error_msg_detail: # Alias used by a *different* (likely mock) ID
                    log(f"CRITICAL WARNING: Alias '{target_chaincode_alias}' is already in use by a DIFFERENT identity. Stale state detected. Please reset chaincode state (redeploy chaincode). Response: {error_msg_detail}")
                    # sys.exit(1) # Consider exiting if strict clean state is required
                else:
                    log(f"Failed to register {target_chaincode_alias}. Response: {reg_result}")
            
            if can_assign_role and target_role and target_role.lower() != "admin":
                method_type = "invoke"
                log(f"Admin '{admin_chaincode_alias}' assigning role '{target_role}' to '{target_chaincode_alias}'")
                role_result = invoke(admin_chaincode_alias, "AssignRoleToIdentity", [target_chaincode_alias, target_role])
                if ok(role_result):
                    log(f"Assigned role '{target_role}' to {target_chaincode_alias}")
                else:
                    log(f"Failed to assign role '{target_role}' to {target_chaincode_alias}. Response: {role_result}")
            elif target_role and target_role.lower() == "admin":
                log(f"Skipping AssignRoleToIdentity for admin alias {target_chaincode_alias}. Will be handled by MakeIdentityAdmin.")
            time.sleep(0.2) # Reduced sleep
        except Exception as e:
            log(f"Error processing identity {target_chaincode_alias}: {e}")

    auditor_kid_name = "auditor_grace_tester"
    if auditor_kid_name in ID_ROSTER and ID_ROSTER[auditor_kid_name]["role"] == "admin" and auditor_kid_name != admin_kid_name:
        grace_alias = str(ID_ROSTER[auditor_kid_name]["alias"])
        grace_actual_full_id = actual_full_ids.get(auditor_kid_name)
        if not grace_actual_full_id:
            log(f"ERROR: Actual FullID for secondary admin {auditor_kid_name} ({grace_alias}) not found. Skipping MakeAdmin.")
        else:
            # Registration for GraceAudits was handled in the loop above.
            # Now, just make admin.
            try:
                method_type = "invoke"
                log(f"Admin '{admin_chaincode_alias}' making '{grace_alias}' (FullID: {grace_actual_full_id}) an admin.")
                make_admin_result = invoke(admin_chaincode_alias, "MakeIdentityAdmin", [grace_alias]) # Use alias
                if ok(make_admin_result):
                    log(f"Made {grace_alias} an admin.")
                else:
                    log(f"Failed to make {grace_alias} admin. Response: {make_admin_result}")
                time.sleep(0.2)
            except Exception as e:
                log(f"Error making {grace_alias} admin: {e}")
    
    log("Identity setup phase complete. Proceeding with admin sanity check...")

    # --- Phase 4: Admin Sanity Check ---
    step("Quick Admin Sanity Check (Admin queries own details by ALIAS)")
    # ... (this part is identical to your last working script, keep it) ...
    method_type = "query"
    admin_details_check = query(admin_chaincode_alias, "GetIdentityDetails", [admin_chaincode_alias])
    if isinstance(admin_details_check, dict) and \
       admin_details_check.get("shortName") == admin_chaincode_alias and \
       admin_details_check.get("isAdmin") is True:
        log(f"OK: Admin '{admin_chaincode_alias}' (signing as {admin_kid_name}) queried own details and is marked as admin on-chain. FullID: {admin_details_check.get('fullId')}")
    else:
        log(f"CRITICAL WARNING: Admin '{admin_chaincode_alias}' query for own details FAILED or not marked as admin. Response: {admin_details_check}")
        sys.exit(1) # Exit if admin setup failed

    # --- Phase 5: Original End-to-End Shipment Lifecycle (SHIP001) ---
    # This ran successfully in the last log, so we assume it sets up SHIP..._001 correctly.
    # We will refer to these identities by their chaincode aliases.
    step("Original End-to-End Shipment Lifecycle (SHIP001) - Abbreviated run for prerequisite")
    shipment_id_1 = BASE_SHIPMENT_ID + "_001"
    current_ts = get_current_utc_timestamp()
    
    farmer_chaincode_alias = str(ID_ROSTER["farmer_alice_tester"]["alias"])
    processor_bob_alias = str(ID_ROSTER["processor_bob_tester"]["alias"])
    certifier_frank_alias = str(ID_ROSTER["certifier_frank_tester"]["alias"])
    distributor_dave_alias = str(ID_ROSTER["distributor_dave_tester"]["alias"])
    retailer_eve_alias = str(ID_ROSTER["retailer_eve_tester"]["alias"])

    farmer_data_1 = {
        "farmerName": "Alice A.", "farmLocation": "Alice's Acres, Guelph, ON", "cropType": "Organic Strawberries",
        "plantingDate": (datetime.datetime.now(timezone.utc) - datetime.timedelta(days=90)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "harvestDate": current_ts, "farmingPractice": "Certified Organic", "fertilizerUsed": "Compost",
        "certificationDocumentHash": PLACEHOLDER_HASH, "destinationProcessorId": processor_bob_alias,
    }
    method_type = "invoke"
    if ok(invoke(farmer_chaincode_alias, "CreateShipment", [shipment_id_1, "Organic Strawberries", "Premium Grade A", "250.5", "kg", json.dumps(farmer_data_1)])):
        log(f"SHIP001 ({shipment_id_1}) created.")
        time.sleep(0.5)
        # Query to confirm SHIP001 exists for later tests, e.g. Archive.
        method_type="query"
        ship_details_1 = query(admin_chaincode_alias, "GetShipmentPublicDetails", [shipment_id_1])
        if not (isinstance(ship_details_1, dict) and ship_details_1.get("id") == shipment_id_1):
            log(f"FATAL: SHIP001 ({shipment_id_1}) not found after creation. Cannot proceed with tests needing it.")
            sys.exit(1)
        else:
            log(f"SHIP001 ({shipment_id_1}) confirmed. Status: {ship_details_1.get('status')}")
    else:
        log(f"ERROR creating SHIP001 ({shipment_id_1}). Some tests might fail.")
        # Don't exit, allow other tests to run if possible.

    # --- Phase 6: Testing Remaining Admin Operations ---
    step("Testing Admin Operations: Archive, Unarchive")
    if isinstance(ship_details_1, dict) and ship_details_1.get("id") == shipment_id_1 : # Check if SHIP001 was created
        method_type = "invoke"
        log(f"Admin '{admin_chaincode_alias}' archiving SHIP001 ({shipment_id_1})")
        res_arc = invoke(admin_chaincode_alias, "ArchiveShipment", [shipment_id_1, "Test archive reason"])
        if ok(res_arc):
            log(f"ArchiveShipment call for {shipment_id_1} successful.")
            time.sleep(1)
            method_type = "query"
            ship_details_archived = query(admin_chaincode_alias, "GetShipmentPublicDetails", [shipment_id_1])
            if isinstance(ship_details_archived, dict) and ship_details_archived.get("isArchived") is True:
                log(f"SUCCESS: SHIP001 ({shipment_id_1}) isArchived is True.")
            else:
                log(f"FAILURE: SHIP001 ({shipment_id_1}) isArchived is not True after archiving. Details: {ship_details_archived}")
        else:
            log(f"ERROR ArchiveShipment for {shipment_id_1}: {res_arc}")

        method_type = "invoke"
        log(f"Admin '{admin_chaincode_alias}' unarchiving SHIP001 ({shipment_id_1})")
        res_unarc = invoke(admin_chaincode_alias, "UnarchiveShipment", [shipment_id_1])
        if ok(res_unarc):
            log(f"UnarchiveShipment call for {shipment_id_1} successful.")
            time.sleep(1)
            method_type = "query"
            ship_details_unarchived = query(admin_chaincode_alias, "GetShipmentPublicDetails", [shipment_id_1])
            if isinstance(ship_details_unarchived, dict) and ship_details_unarchived.get("isArchived") is False:
                log(f"SUCCESS: SHIP001 ({shipment_id_1}) isArchived is False.")
            else:
                log(f"FAILURE: SHIP001 ({shipment_id_1}) isArchived is not False after unarchiving. Details: {ship_details_unarchived}")
        else:
            log(f"ERROR UnarchiveShipment for {shipment_id_1}: {res_unarc}")
    else:
        log(f"Skipping Archive/Unarchive tests as SHIP001 ({shipment_id_1}) was not confirmed created.")


    step("Testing Admin Chaincode Utility: GetFullIDForAlias")
    method_type = "query"
    farmer_actual_full_id_check = actual_full_ids.get("farmer_alice_tester")
    log(f"Admin querying GetFullIDForAlias for '{farmer_chaincode_alias}'")
    resolved_id_from_cc = query(admin_chaincode_alias, "GetFullIDForAlias", [farmer_chaincode_alias])
    # The query function returns the direct result string if it's not JSON.
    if isinstance(resolved_id_from_cc, str) and resolved_id_from_cc == farmer_actual_full_id_check:
        log(f"SUCCESS: GetFullIDForAlias for '{farmer_chaincode_alias}' returned '{resolved_id_from_cc}' (matches expected).")
    elif isinstance(resolved_id_from_cc, dict) and resolved_id_from_cc.get("result") == farmer_actual_full_id_check : # Kaleido might wrap it
        log(f"SUCCESS: GetFullIDForAlias for '{farmer_chaincode_alias}' returned '{resolved_id_from_cc.get('result')}' (matches expected).")
    else:
        log(f"FAILURE: GetFullIDForAlias for '{farmer_chaincode_alias}'. Expected '{farmer_actual_full_id_check}', Got: '{resolved_id_from_cc}'")

    # --- Phase 7: Testing Remaining Identity Management Wrappers ---
    step("Testing Identity Management: RemoveRole, RemoveAdmin, GetAllIdentities")
    temp_role_user_alias = farmer_chaincode_alias # Use AliceAcres
    temp_role = "certifier" # Temporarily make Alice a certifier

    log(f"Admin assigning temporary role '{temp_role}' to '{temp_role_user_alias}'")
    method_type = "invoke"
    res_add_temp_role = invoke(admin_chaincode_alias, "AssignRoleToIdentity", [temp_role_user_alias, temp_role])
    if ok(res_add_temp_role):
        log(f"Assigned '{temp_role}' to '{temp_role_user_alias}'. Verifying...")
        time.sleep(1)
        method_type = "query"
        details_after_add = query(admin_chaincode_alias, "GetIdentityDetails", [temp_role_user_alias])
        if isinstance(details_after_add, dict) and temp_role in details_after_add.get("roles", []):
            log(f"SUCCESS: '{temp_role}' found in roles for '{temp_role_user_alias}'.")
        else:
            log(f"FAILURE: Did not find '{temp_role}' in roles for '{temp_role_user_alias}' after assignment. Details: {details_after_add}")
    else:
        log(f"ERROR assigning temporary role '{temp_role}' to '{temp_role_user_alias}': {res_add_temp_role}")

    log(f"Admin removing role '{temp_role}' from '{temp_role_user_alias}'")
    method_type = "invoke"
    res_rem_role = invoke(admin_chaincode_alias, "RemoveRoleFromIdentity", [temp_role_user_alias, temp_role])
    if ok(res_rem_role):
        log(f"RemoveRoleFromIdentity call for '{temp_role_user_alias}' successful. Verifying...")
        time.sleep(1)
        method_type = "query"
        details_after_remove = query(admin_chaincode_alias, "GetIdentityDetails", [temp_role_user_alias])
        if isinstance(details_after_remove, dict) and temp_role not in details_after_remove.get("roles", []):
            log(f"SUCCESS: '{temp_role}' NOT found in roles for '{temp_role_user_alias}'.")
        else:
            log(f"FAILURE: Still found '{temp_role}' in roles for '{temp_role_user_alias}' after removal or error. Details: {details_after_remove}")
    else:
        log(f"ERROR RemoveRoleFromIdentity for '{temp_role_user_alias}': {res_rem_role}")

    secondary_admin_alias = str(ID_ROSTER["auditor_grace_tester"]["alias"])
    log(f"Admin '{admin_chaincode_alias}' removing admin status from '{secondary_admin_alias}'")
    method_type = "invoke"
    res_rem_admin = invoke(admin_chaincode_alias, "RemoveIdentityAdmin", [secondary_admin_alias])
    if ok(res_rem_admin):
        log(f"RemoveIdentityAdmin call for '{secondary_admin_alias}' successful. Verifying...")
        time.sleep(1)
        method_type = "query"
        details_after_rem_admin = query(admin_chaincode_alias, "GetIdentityDetails", [secondary_admin_alias])
        if isinstance(details_after_rem_admin, dict) and details_after_rem_admin.get("isAdmin") is False:
            log(f"SUCCESS: '{secondary_admin_alias}' isAdmin is False.")
        else:
            log(f"FAILURE: '{secondary_admin_alias}' isAdmin is not False after removal. Details: {details_after_rem_admin}")
        # Make Grace admin again for any subsequent tests needing a second admin
        method_type = "invoke"
        invoke(admin_chaincode_alias, "MakeIdentityAdmin", [secondary_admin_alias]) 
        log(f"Restored admin status for {secondary_admin_alias}")
    else:
        log(f"ERROR RemoveIdentityAdmin for '{secondary_admin_alias}': {res_rem_admin}")

    log("Admin querying GetAllIdentities")
    method_type = "query"
    all_identities = query(admin_chaincode_alias, "GetAllIdentities", [])
    if isinstance(all_identities, list) and len(all_identities) >= len(ID_ROSTER):
        log(f"SUCCESS: GetAllIdentities returned {len(all_identities)} identities.")
        found_aliases = [identity.get("shortName") for identity in all_identities if isinstance(identity, dict)]
        log(f"Found aliases: {found_aliases}")
        # Basic check
        if farmer_chaincode_alias in found_aliases and admin_chaincode_alias in found_aliases:
            log("Verified presence of key aliases in GetAllIdentities result.")
        else:
            log("WARNING: Key aliases not all found in GetAllIdentities result.")
    else:
        log(f"FAILURE: GetAllIdentities did not return a list or was too short. Response: {all_identities}")
        
    # --- Phase 8: Testing Advanced Processor Operations ---
    step("Testing Advanced Processor Operations: TransformAndCreateProducts")
    shipment_id_input1 = BASE_SHIPMENT_ID + "_INPUT_001"
    shipment_id_input2 = BASE_SHIPMENT_ID + "_INPUT_002"
    shipment_id_output1 = BASE_SHIPMENT_ID + "_OUTPUT_001"
    transform_processor_alias = str(ID_ROSTER["processor_charlie_tester"]["alias"])

    # Create input shipments and process them to be owned by CharlieTransform
    for sid_in, crop_name in [(shipment_id_input1, "Organic Apples"), (shipment_id_input2, "Organic Pears")]:
        log(f"Setting up input shipment {sid_in} for transformation test.")
        fdata = {
            "farmerName": "Alice A.", "farmLocation": "Alice's Orchard", "cropType": crop_name,
            "plantingDate": (datetime.datetime.now(timezone.utc) - datetime.timedelta(days=100)).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "harvestDate": get_current_utc_timestamp(), "farmingPractice": "Organic", "fertilizerUsed": "Manure",
            "certificationDocumentHash": PLACEHOLDER_HASH, "destinationProcessorId": transform_processor_alias,
        }
        method_type = "invoke"
        if ok(invoke(farmer_chaincode_alias, "CreateShipment", [sid_in, crop_name, "For juicing", "100", "kg", json.dumps(fdata)])):
            log(f"Input shipment {sid_in} created.")
            time.sleep(1)
            # Processor Charlie processes it (no certification needed for this test path)
            pdata_simple = {
                "dateProcessed": get_current_utc_timestamp(), "processingType": "Initial приемка", "processingLineId": "IN-LINE",
                "processingLocation": "Charlie's Intake", "contaminationCheck": "PASS", "outputBatchId": f"BATCH-{sid_in}",
                "expiryDate": (datetime.datetime.now(timezone.utc) + datetime.timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "qualityCertifications": [], "destinationDistributorId": str(ID_ROSTER["distributor_dave_tester"]["alias"]), # Dummy
            }
            if ok(invoke(transform_processor_alias, "ProcessShipment", [sid_in, json.dumps(pdata_simple)])):
                log(f"Input shipment {sid_in} processed by {transform_processor_alias}, status should be PROCESSED.")
            else:
                log(f"ERROR processing input shipment {sid_in} by {transform_processor_alias}. Transform test might fail.")
                # Consider exiting or skipping transform test if setup fails
        else:
            log(f"ERROR creating input shipment {sid_in}. Transform test might fail.")
        time.sleep(1)

    input_consumption_json = json.dumps([
        {"shipmentId": shipment_id_input1},
        {"shipmentId": shipment_id_input2}
    ])
    new_products_data_json = json.dumps([
        {"newShipmentId": shipment_id_output1, "productName": "Organic Apple-Pear Juice", 
         "description": "Cloudy, 100% Juice", "quantity": 150.0, "unitOfMeasure": "liters"}
    ])
    processor_data_transform_json = json.dumps({
        "dateProcessed": get_current_utc_timestamp(), "processingType": "Juicing and Bottling", 
        "processingLineId": "JUICE-LINE-1", "processingLocation": "Charlie's Transformation Plant",
        "contaminationCheck": "PASS", "outputBatchId": "JUICE-BATCH-001", 
        "expiryDate": (datetime.datetime.now(timezone.utc) + datetime.timedelta(days=180)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "qualityCertifications": ["ColdPressedCertified", "Vegan"], 
        "destinationDistributorId": str(ID_ROSTER["distributor_dave_tester"]["alias"]) # A valid distributor alias
    })

    log(f"Processor '{transform_processor_alias}' calling TransformAndCreateProducts.")
    method_type = "invoke"
    res_transform = invoke(transform_processor_alias, "TransformAndCreateProducts", [input_consumption_json, new_products_data_json, processor_data_transform_json])
    if ok(res_transform):
        log("SUCCESS: TransformAndCreateProducts call completed.")
        time.sleep(1)
        method_type = "query"
        # Verify input shipments
        for sid_in_check in [shipment_id_input1, shipment_id_input2]:
            details_input = query(admin_chaincode_alias, "GetShipmentPublicDetails", [sid_in_check])
            if isinstance(details_input, dict) and details_input.get("status") == "CONSUMED_IN_PROCESSING":
                log(f"Input shipment {sid_in_check} status is correctly CONSUMED_IN_PROCESSING.")
            else:
                log(f"FAILURE: Input shipment {sid_in_check} status incorrect after transform. Details: {details_input}")
        # Verify output shipment
        details_output = query(admin_chaincode_alias, "GetShipmentPublicDetails", [shipment_id_output1])
        if isinstance(details_output, dict) and \
           details_output.get("id") == shipment_id_output1 and \
           details_output.get("isDerivedProduct") is True and \
           shipment_id_input1 in details_output.get("inputShipmentIds", []) and \
           shipment_id_input2 in details_output.get("inputShipmentIds", []):
            log(f"SUCCESS: Output shipment {shipment_id_output1} created correctly as derived product.")
            log(f"Output shipment details: {details_output}")
        else:
            log(f"FAILURE: Output shipment {shipment_id_output1} incorrect after transform. Details: {details_output}")
    else:
        log(f"ERROR TransformAndCreateProducts: {res_transform}")

    # --- Phase 9: Testing Query Operations ---
    step("Testing Query Operations: GetMyShipments, GetAllShipments, GetShipmentsByStatus")
    
    # GetMyShipments (as farmer)
    log(f"Querying GetMyShipments for farmer '{farmer_chaincode_alias}'")
    method_type = "query"
    my_shipments_farmer = query(farmer_chaincode_alias, "GetMyShipments", ["5", ""]) # Page size 5, no bookmark
    if isinstance(my_shipments_farmer, dict) and "shipments" in my_shipments_farmer:
        log(f"SUCCESS: GetMyShipments for farmer returned {my_shipments_farmer.get('fetchedCount')} shipments. Next bookmark: '{my_shipments_farmer.get('nextBookmark')}'")
        # Add more checks if needed, e.g., verify owner is indeed farmer_alice_tester's fullID
        for ship in my_shipments_farmer["shipments"]:
             log(f"  - Farmer's shipment: {ship.get('id')}, Product: {ship.get('productName')}")
             if ship.get("currentOwnerAlias") != farmer_chaincode_alias:
                 log(f"    WARNING: currentOwnerAlias mismatch for farmer's shipment {ship.get('id')}")
    else:
        log(f"FAILURE: GetMyShipments for farmer. Response: {my_shipments_farmer}")

    # GetAllShipments (as admin)
    log(f"Querying GetAllShipments as admin '{admin_chaincode_alias}'")
    method_type = "query"
    all_shipments_admin = query(admin_chaincode_alias, "GetAllShipments", ["3", ""]) # Page size 3
    if isinstance(all_shipments_admin, dict) and "shipments" in all_shipments_admin:
        log(f"SUCCESS: GetAllShipments for admin returned {all_shipments_admin.get('fetchedCount')} shipments. Next bookmark: '{all_shipments_admin.get('nextBookmark')}'")
        for ship in all_shipments_admin["shipments"]:
             log(f"  - Admin's view of shipment: {ship.get('id')}, Product: {ship.get('productName')}, Status: {ship.get('status')}")
    else:
        log(f"FAILURE: GetAllShipments for admin. Response: {all_shipments_admin}")

    # GetShipmentsByStatus (as admin, for CREATED)
    log(f"Querying GetShipmentsByStatus for 'CREATED' as admin '{admin_chaincode_alias}'")
    method_type = "query"
    shipments_by_status = query(admin_chaincode_alias, "GetShipmentsByStatus", ["CREATED", "5", ""])
    if isinstance(shipments_by_status, dict) and "shipments" in shipments_by_status:
        log(f"SUCCESS: GetShipmentsByStatus for 'CREATED' returned {shipments_by_status.get('fetchedCount')} shipments.")
        all_created = True
        for ship in shipments_by_status["shipments"]:
            log(f"  - Shipment with Status CREATED: {ship.get('id')}, Product: {ship.get('productName')}")
            if ship.get("status") != "CREATED": all_created = False
        if not all_created and len(shipments_by_status["shipments"]) > 0 : log("    WARNING: Not all shipments in result actually have CREATED status!")
    else:
        log(f"FAILURE: GetShipmentsByStatus for 'CREATED'. Response: {shipments_by_status}")
        
    # --- Phase 10: Testing Recall Operations ---
    step("Testing Recall Operations: InitiateRecall, AddLinkedShipments, QueryRelated")
    shipment_id_recalled = BASE_SHIPMENT_ID + "_RECALL_MAIN_001"
    shipment_id_linked_recall = BASE_SHIPMENT_ID + "_RECALL_LINKED_001"
    recall_event_id = f"RECALL-EVT-{uuid.uuid4()}"

    # Setup a shipment for recall (Farmer -> Processor -> Distributor -> Retailer)
    log(f"Setting up shipment {shipment_id_recalled} to be recalled.")
    fdata_recall = { # Same as farmer_data_1 but with different dest proc for variety
        "farmerName": "Alice A.", "farmLocation": "Alice's South Farm", "cropType": "Organic Tomatoes",
        "plantingDate": (datetime.datetime.now(timezone.utc) - datetime.timedelta(days=60)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "harvestDate": get_current_utc_timestamp(), "farmingPractice": "Organic", "fertilizerUsed": "Seaweed Extract",
        "certificationDocumentHash": PLACEHOLDER_HASH, "destinationProcessorId": processor_bob_alias,
    }
    method_type = "invoke"
    # Create
    if not ok(invoke(farmer_chaincode_alias, "CreateShipment", [shipment_id_recalled, "Organic Tomatoes", "Vine Ripe", "500", "kg", json.dumps(fdata_recall)])):
        log(f"ERROR creating {shipment_id_recalled} for recall test. Skipping recall tests."); sys.exit(1) # Fatal if this fails
    log(f"{shipment_id_recalled} created by farmer.")
    time.sleep(0.5)
    # Certify (optional, but good practice)
    if not ok(invoke(farmer_chaincode_alias, "SubmitForCertification", [shipment_id_recalled])): log(f"Error submitting {shipment_id_recalled} for cert")
    time.sleep(0.5)
    if not ok(invoke(certifier_frank_alias, "RecordCertification", [shipment_id_recalled, get_current_utc_timestamp(), "CertHashTomato001", "APPROVED", "Prime quality"])): log(f"Error recording cert for {shipment_id_recalled}")
    time.sleep(0.5)
    # Process
    pdata_recall = {
        "dateProcessed": get_current_utc_timestamp(), "processingType": "Sorted and Boxed", "processingLineId": "TOMATO-LINE-A",
        "processingLocation": "Bob's Tomato Sorting", "contaminationCheck": "PASS", "outputBatchId": f"BATCH-{shipment_id_recalled}",
        "expiryDate": (datetime.datetime.now(timezone.utc) + datetime.timedelta(days=10)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "qualityCertifications": ["NonGMO"], "destinationDistributorId": distributor_dave_alias,
    }
    if not ok(invoke(processor_bob_alias, "ProcessShipment", [shipment_id_recalled, json.dumps(pdata_recall)])):
        log(f"ERROR processing {shipment_id_recalled}. Skipping recall tests."); sys.exit(1)
    log(f"{shipment_id_recalled} processed by processor.")
    time.sleep(0.5)
    # Distribute
    ddata_recall = {
        "pickupDateTime": get_current_utc_timestamp(), "deliveryDateTime": (datetime.datetime.now(timezone.utc) + datetime.timedelta(hours=4)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "distributionLineId": "CITY-ROUTE-12", "temperatureRange": "8-12°C", "storageTemperature": 10.0,
        "transitLocationLog": ["Bob's Plant -> City Hub"], "transportConditions": "Standard",
        "distributionCenter": "City Hub South", "destinationRetailerId": retailer_eve_alias,
    }
    if not ok(invoke(distributor_dave_alias, "DistributeShipment", [shipment_id_recalled, json.dumps(ddata_recall)])):
        log(f"ERROR distributing {shipment_id_recalled}. Skipping recall tests."); sys.exit(1)
    log(f"{shipment_id_recalled} distributed by distributor.")
    time.sleep(0.5)
    # Receive by Retailer (EveMart becomes owner)
    rdata_recall = {
        "dateReceived": (datetime.datetime.now(timezone.utc) + datetime.timedelta(hours=4)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "retailerLineId": "Dock-5", "productNameRetail": "Fresh Organic Tomatoes", "shelfLife": "7 days",
        "sellByDate": (datetime.datetime.now(timezone.utc) + datetime.timedelta(days=7, hours=4)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "storeId": "EVE-002", "storeLocation": "456 Market St", "price": 3.99, "qrCodeLink": f"http://example.com/qr/{shipment_id_recalled}",
    }
    if not ok(invoke(retailer_eve_alias, "ReceiveShipment", [shipment_id_recalled, json.dumps(rdata_recall)])):
        log(f"ERROR receiving {shipment_id_recalled} by retailer. Skipping recall tests."); sys.exit(1)
    log(f"{shipment_id_recalled} received by retailer '{retailer_eve_alias}'.")
    time.sleep(1)

    # Initiate Recall (by retailer Eve, current owner)
    log(f"Retailer '{retailer_eve_alias}' initiating recall for {shipment_id_recalled}")
    method_type = "invoke"
    res_init_recall = invoke(retailer_eve_alias, "InitiateRecall", [shipment_id_recalled, recall_event_id, "Suspected contamination during retail display"])
    if ok(res_init_recall):
        log(f"SUCCESS: InitiateRecall for {shipment_id_recalled} successful.")
        time.sleep(1)
        method_type="query"
        details_recalled = query(admin_chaincode_alias, "GetShipmentPublicDetails", [shipment_id_recalled])
        if isinstance(details_recalled, dict) and \
           details_recalled.get("recallInfo", {}).get("isRecalled") is True and \
           details_recalled.get("status") == "RECALLED" and \
           details_recalled.get("recallInfo", {}).get("recallId") == recall_event_id:
            log(f"Verified: {shipment_id_recalled} isRecalled is True, status is RECALLED, recallId matches.")
        else:
            log(f"FAILURE: Verification after InitiateRecall failed for {shipment_id_recalled}. Details: {details_recalled}")
    else:
        log(f"ERROR InitiateRecall for {shipment_id_recalled}: {res_init_recall}")

    # Setup a shipment to be linked (processed by Bob on same line around same time as shipment_id_recalled)
    log(f"Setting up shipment {shipment_id_linked_recall} to be linked to recall.")
    fdata_linked = {
        "farmerName": "Farmer Fred", "farmLocation": "Fred's Fields", "cropType": "Organic Bell Peppers",
        "harvestDate": pdata_recall["dateProcessed"], # Harvested around same time processor_bob_alias processed tomatoes
        "destinationProcessorId": processor_bob_alias, # Same processor as recalled shipment
        # ... other farmer fields ...
        "plantingDate": (datetime.datetime.now(timezone.utc) - datetime.timedelta(days=70)).strftime("%Y-%m-%dT%H:%M:%SZ"),
         "farmingPractice": "Organic", "fertilizerUsed": "Compost Mix", "certificationDocumentHash": PLACEHOLDER_HASH,
    }
    method_type = "invoke"
    if not ok(invoke(farmer_chaincode_alias, "CreateShipment", [shipment_id_linked_recall, "Organic Bell Peppers", "Mixed Colors", "200", "kg", json.dumps(fdata_linked)])):
        log(f"ERROR creating {shipment_id_linked_recall} for recall linking test. Skipping linking."); 
    else:
        log(f"{shipment_id_linked_recall} created.")
        time.sleep(0.5)
        pdata_linked = { # Processed by Bob on same line
            "dateProcessed": pdata_recall["dateProcessed"], # Same processing date
            "processingType": "Washed and Bagged", "processingLineId": pdata_recall["processingLineId"], # SAME PROCESSING LINE ID
            "processingLocation": pdata_recall["processingLocation"], "contaminationCheck": "PASS", "outputBatchId": f"BATCH-{shipment_id_linked_recall}",
            "destinationDistributorId": distributor_dave_alias,
             "expiryDate": (datetime.datetime.now(timezone.utc) + datetime.timedelta(days=10)).strftime("%Y-%m-%dT%H:%M:%SZ"),
             "qualityCertifications": ["FreshCertified"],
        }
        if not ok(invoke(processor_bob_alias, "ProcessShipment", [shipment_id_linked_recall, json.dumps(pdata_linked)])):
            log(f"ERROR processing {shipment_id_linked_recall}. Skipping linking.")
        else:
            log(f"{shipment_id_linked_recall} processed by {processor_bob_alias} on same line as recalled tomatoes.")
            time.sleep(1)
            # Add linked shipment to recall (by admin)
            linked_ids_json = json.dumps([shipment_id_linked_recall])
            log(f"Admin '{admin_chaincode_alias}' adding {shipment_id_linked_recall} to recall event '{recall_event_id}' of {shipment_id_recalled}")
            method_type = "invoke"
            res_add_link = invoke(admin_chaincode_alias, "AddLinkedShipmentsToRecall", [recall_event_id, shipment_id_recalled, linked_ids_json])
            if ok(res_add_link):
                log(f"SUCCESS: AddLinkedShipmentsToRecall call successful.")
                time.sleep(1)
                method_type="query"
                details_linked = query(admin_chaincode_alias, "GetShipmentPublicDetails", [shipment_id_linked_recall])
                if isinstance(details_linked, dict) and \
                   details_linked.get("recallInfo", {}).get("isRecalled") is True and \
                   details_linked.get("recallInfo", {}).get("recallId") == recall_event_id:
                    log(f"Verified: {shipment_id_linked_recall} isRecalled is True and linked to recall '{recall_event_id}'.")
                else:
                    log(f"FAILURE: Verification after AddLinkedShipmentsToRecall failed for {shipment_id_linked_recall}. Details: {details_linked}")
            else:
                log(f"ERROR AddLinkedShipmentsToRecall: {res_add_link}")
    
    # QueryRelatedShipments (by admin)
    log(f"Admin '{admin_chaincode_alias}' querying related shipments for recall event of {shipment_id_recalled}")
    method_type = "query"
    # Using a time window of 24 hours for the test
    related_shipments_result = query(admin_chaincode_alias, "QueryRelatedShipments", [shipment_id_recalled, "24"])
    if isinstance(related_shipments_result, list):
        log(f"SUCCESS: QueryRelatedShipments returned {len(related_shipments_result)} items.")
        found_linked_in_query = False
        for rel_ship in related_shipments_result:
            log(f"  - Related: {rel_ship.get('shipmentId')}, Reason: {rel_ship.get('relationReason')}, Actor: {rel_ship.get('actorAlias')}")
            if rel_ship.get('shipmentId') == shipment_id_linked_recall:
                found_linked_in_query = True
        if found_linked_in_query:
            log(f"Verified: Linked shipment {shipment_id_linked_recall} found in QueryRelatedShipments result.")
        elif len(related_shipments_result) > 0 : # If it found *some* but not the one we specifically set up
             log(f"WARNING: Linked shipment {shipment_id_linked_recall} was NOT found by QueryRelatedShipments, though other relations might exist.")
        elif not shipment_id_linked_recall: # If linked shipment setup failed
            log(f"INFO: Linked shipment was not set up, so QueryRelatedShipments might not find it.")
        else: # Found none, and we expected one
            log(f"FAILURE: QueryRelatedShipments did not find the expected linked shipment {shipment_id_linked_recall}.")


    else:
        log(f"FAILURE: QueryRelatedShipments did not return a list. Response: {related_shipments_result}")

    # --- Phase 11: Test chaincode helper TestAssignRoleToSelf ---
    step("Testing Chaincode Test Helper: TestAssignRoleToSelf")
    # Farmer Alice will try to assign herself the 'certifier' role using the test function
    farmer_kid_name = "farmer_alice_tester"
    farmer_alias = str(ID_ROSTER[farmer_kid_name]["alias"])
    test_role_for_farmer = "certifier"

    log(f"Identity '{farmer_alias}' attempting to use TestAssignRoleToSelf to get role '{test_role_for_farmer}'")
    method_type = "invoke"
    res_assign_self = invoke(farmer_alias, "TestAssignRoleToSelf", [test_role_for_farmer])
    if ok(res_assign_self):
        log(f"SUCCESS: TestAssignRoleToSelf call by '{farmer_alias}' for role '{test_role_for_farmer}' seemed successful. Verifying...")
        time.sleep(1)
        method_type = "query"
        farmer_details_after_self_assign = query(admin_chaincode_alias, "GetIdentityDetails", [farmer_alias])
        if isinstance(farmer_details_after_self_assign, dict) and test_role_for_farmer in farmer_details_after_self_assign.get("roles", []):
            log(f"Verified: '{farmer_alias}' now has role '{test_role_for_farmer}'.")
            # Clean up: Admin removes the test role
            method_type = "invoke"
            log(f"Admin cleaning up: removing role '{test_role_for_farmer}' from '{farmer_alias}'")
            res_cleanup_role = invoke(admin_chaincode_alias, "RemoveRoleFromIdentity", [farmer_alias, test_role_for_farmer])
            if ok(res_cleanup_role):
                log(f"Role '{test_role_for_farmer}' removed from '{farmer_alias}'.")
            else:
                log(f"ERROR cleaning up role for '{farmer_alias}': {res_cleanup_role}")
        else:
            log(f"FAILURE: Role '{test_role_for_farmer}' not found for '{farmer_alias}' after TestAssignRoleToSelf. Details: {farmer_details_after_self_assign}")
    else:
        log(f"ERROR during TestAssignRoleToSelf for '{farmer_alias}': {res_assign_self}")


    print(f"\n--- COMPREHENSIVE TEST SUITE COMPLETE ---")
    print(f"See {LOG_FILE} for detailed logs.")

if __name__ == "__main__":
    main()