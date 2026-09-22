# OAuth 2.0 Device Code Flow: Securing Smart TVs and CLI Tools

## The Problem: The Insecure UI Gap on Input-Constrained Devices
Modern development workflows and entertainment setups involve devices with severely limited input interfaces, such as command-line interface (CLI) tools running in SSH sessions, Smart TVs, IoT appliances, and gaming consoles. When these platforms require access to user accounts, forcing users to type complex, high-entropy passwords on a television remote control or pasting sensitive API credentials into a remote shell is highly frustrating and security-deficient. 

Furthermore, these devices lack a secure web browser to run standard OAuth 2.0 Authorization Code redirects (which require handling `localhost` loopbacks or private URL schemes). To solve this UI and security gap, applications need an authorization mechanism that delegates user sign-in and consent to a secondary, input-rich device—such as a smartphone or personal computer—without exposing user credentials to the target device.

## The Mental Model: Asynchronous Out-of-Band Delegation
The OAuth 2.0 Device Authorization Grant (defined in RFC 8628) addresses this challenge by decoupling the client device requesting the token from the device executing the authentication. 

```
+---------------+                              +----------------------+
| Input-Limited |--- 1. Request Device Code -> |                      |
| Client Device |                              |                      |
|  (TV / CLI)   |<-- 2. User & Device Codes ---|                      |
+---------------+                              |                      |
       |                                       |    Authorization     |
  [Show Code &]                                |        Server        |
  [URL to User]                                |                      |
       |                                       |                      |
+---------------+                              |                      |
| User Browser  |--- 4. Enter User Code ------>|                      |
| (Mobile/PC)   |<-- 5. Authenticate & Approve |                      |
+---------------+                              +----------------------+
       |                                                   ^
       |                                                   |
       v (Asynchronously)                                  |
+---------------+                                          |
| Input-Limited |<-- 3. Poll for Token (using dev_code) ---+
| Client Device |--- 6. Return Access & Refresh Tokens --->|
+---------------+
```

The flow operates asynchronously. The input-constrained device requests authorization from the Authorization Server (AS) and receives a **user code** and a **device code**. The client displays the user code and a verification URL, and then begins polling the AS in the background using the device code. The user navigates to the URL on their smartphone or PC, authenticates, and enters the user code. Once the user approves the access request, the next poll from the client device succeeds, and the AS issues the access token.

## Protocol Implementation and Python CLI Code
The protocol exchange consists of two main endpoints: the device authorization endpoint and the token endpoint.

### Python Polling CLI Implementation
Here is a robust Python pattern for a CLI tool executing the Device Code Flow, initiating the flow, printing instructions, and polling the token endpoint:

```python
import time
import requests

CLIENT_ID = "serenya-cli-tool"
AUTH_SERVER = "https://identity.serenya.com"
AUTH_ENDPOINT = f"{AUTH_SERVER}/oauth/device/authorize"
TOKEN_ENDPOINT = f"{AUTH_SERVER}/oauth/token"

def run_device_code_flow():
    # 1. Request device authorization
    resp = requests.post(AUTH_ENDPOINT, data={
        "client_id": CLIENT_ID,
        "scope": "read:profile write:deploy"
    })
    resp.raise_for_status()
    auth_data = resp.json()

    device_code = auth_data["device_code"]
    user_code = auth_data["user_code"]
    verification_uri = auth_data["verification_uri"]
    interval = auth_data.get("interval", 5)
    expires_in = auth_data["expires_in"]

    print("\n=== ACTION REQUIRED ===")
    print(f"Please navigate to: {verification_uri}")
    print(f"And enter the following code: {user_code}")
    print(f"This code will expire in {expires_in // 60} minutes.\n")

    # 2. Poll the token endpoint
    start_time = time.time()
    while time.time() - start_time < expires_in:
        token_resp = requests.post(TOKEN_ENDPOINT, data={
            "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
            "device_code": device_code,
            "client_id": CLIENT_ID
        })

        if token_resp.status_code == 200:
            tokens = token_resp.json()
            print("Successfully authenticated!")
            print(f"Access Token: {tokens['access_token'][:15]}...")
            return tokens

        error_data = token_resp.json()
        error = error_data.get("error")

        if error == "authorization_pending":
            time.sleep(interval)
        elif error == "slow_down":
            interval += 5
            time.sleep(interval)
        elif error in ["expired_token", "access_denied"]:
            print(f"Authentication failed: {error}")
            break
        else:
            print(f"Unexpected error: {error}")
            break

if __name__ == "__main__":
    run_device_code_flow()
```

## Security Attack Vectors and Hardening
1. **User Code Phishing (Prompt Hijacking):** Attackers can generate valid user codes on their own device and send them to victims via email or SMS, claiming they need to authenticate. If the victim inputs the attacker's code, they grant the attacker's device access to their account.
   - *Defense:* The AS confirmation page must display context about the device making the request (e.g., "An SSH CLI session in Seattle is requesting access").
2. **Denial of Service (AS Overload):** Rogue devices polling the token endpoint at high frequencies.
   - *Defense:* Enforce strict rate-limiting on the token endpoint and respond with `slow_down` error codes to adjust polling intervals.

By cleanly isolating credentials on the secondary user-agent and implementing strict rate limits and device contextual approval screens, engineers can bring secure, friction-free OAuth integrations to televisions and terminals alike.
