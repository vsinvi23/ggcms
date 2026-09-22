# Security Controls Decoded: Integrating Administrative, Technical, and Physical Safeguards

## The Problem: The Single Point of Failure (The Eggshell Security Model)
In security engineering, an "eggshell" architecture is hard on the outside but completely soft on the inside. Companies often build high-performance technical perimeters—such as next-generation web application firewalls (WAF), API gateways, and sophisticated encryption—yet remain vulnerable to catastrophic failure modes:
1. **The Physical Gap:** An attacker tailgates an employee into a corporate office, plugs a Raspberry Pi with a cellular connection directly into an open ethernet port behind an unattended desk, and bypasses the WAF entirely.
2. **The Administrative Gap:** A developer is spear-phished, enters their credentials into a mock login portal, and has their session hijacked because there was no administrative mandate to enforce hardware-backed MFA keys.

Relying on a single category of security is a critical risk. True resilience requires a holistic **Defense-in-Depth** model containing three pillars of security controls: **Administrative**, **Technical**, and **Physical**.

---

## The Onion Defense-In-Depth Model

Security controls must wrap around critical business assets like layers of an onion. If one layer is breached, the subsequent layers must contain the compromise.

```
       +-------------------------------------------------+
       |              ADMINISTRATIVE CONTROLS            |
       |  (Policies, Incident Response Plans, Training)  |
       |   +-----------------------------------------+   |
       |   |             PHYSICAL CONTROLS           |   |
       |   |  (Locks, CCTV, Badges, Server Cages)    |   |
       |   |   +---------------------------------+   |   |
       |   |   |        TECHNICAL CONTROLS       |   |   |
       |   |   |  (Encryption, Firewalls, FIM)   |   |   |
       |   |   |   +-------------------------+   |   |   |
       |   |   |   |       DATA ASSET        |   |   |   |
       |   |   |   +-------------------------+   |   |   |
       |   |   +---------------------------------+   |   |
       |   +-----------------------------------------+   |
       +-------------------------------------------------+
```

---

## Detailed Control Matrix

| Control Category | Core Purpose | Concrete Examples |
| :--- | :--- | :--- |
| **Administrative** | Defines security guidelines, policies, operational procedures, and human-centric expectations. | - Password complexity policies<br>- Background checks for new hires<br>- Annual security awareness training<br>- Data classification guidelines |
| **Technical** | Enforces policies electronically through software, hardware, and logical configurations. | - Multi-Factor Authentication (MFA)<br>- AES-256 database-at-rest encryption<br>- Network intrusion detection systems (IDS)<br>- File Integrity Monitors (FIM) |
| **Physical** | Prevents direct physical contact with, or structural access to, tangible corporate assets. | - Perimeter fencing & security guards<br>- Biometric badge scanners at data centers<br>- Hardware locks on server racks<br>- Environmental controls (fire suppression) |

---

## Technical Control Implementation: File Integrity Monitor (FIM) in Python

To demonstrate a robust technical control that validates administrative compliance, we can write a File Integrity Monitor. FIM operates as a technical detective control that monitors system directories for unauthorized changes (tampering) to ensure critical system configurations are not altered.

```python
import os
import hashlib
import json
from typing import Dict, Tuple

class FileIntegrityMonitor:
    def __init__(self, watch_directory: str, baseline_file_path: str):
        self.watch_directory = watch_directory
        self.baseline_file_path = baseline_file_path
        self.baseline: Dict[str, str] = {}

    def _calculate_sha256(self, file_path: str) -> str:
        """Calculates SHA-256 hash of a file in binary-safe chunks."""
        hasher = hashlib.sha256()
        try:
            with open(file_path, 'rb') as f:
                while chunk := f.read(8192):
                    hasher.update(chunk)
            return hasher.hexdigest()
        except (FileNotFoundError, PermissionError):
            return ""

    def generate_baseline(self):
        """Scans the watch directory and writes a baseline JSON report."""
        print(f"[FIM] Scanning directory '{self.watch_directory}' to generate baseline...")
        new_baseline = {}
        for root, _, files in os.walk(self.watch_directory):
            for file in files:
                full_path = os.path.join(root, file)
                file_hash = self._calculate_sha256(full_path)
                if file_hash:
                    new_baseline[full_path] = file_hash

        with open(self.baseline_file_path, 'w') as f:
            json.dump(new_baseline, f, indent=4)
        
        self.baseline = new_baseline
        print(f"[FIM SUCCESS] Baseline established. Records saved to '{self.baseline_file_path}'.")

    def load_baseline(self) -> bool:
        """Loads baseline file from disk."""
        if not os.path.exists(self.baseline_file_path):
            print(f"[FIM ERROR] Baseline file '{self.baseline_file_path}' not found. Run generate_baseline first.")
            return False
        with open(self.baseline_file_path, 'r') as f:
            self.baseline = json.load(f)
        return True

    def scan_and_verify(self) -> Tuple[List[str], List[str], List[str]]:
        """
        Scans watch directory and compares state to baseline.
        Returns: (Modified Files, Added Files, Deleted Files)
        """
        if not self.baseline:
            self.load_baseline()

        current_files: Dict[str, str] = {}
        for root, _, files in os.walk(self.watch_directory):
            for file in files:
                full_path = os.path.join(root, file)
                file_hash = self._calculate_sha256(full_path)
                if file_hash:
                    current_files[full_path] = file_hash

        modified: List[str] = []
        added: List[str] = []
        deleted: List[str] = []

        # Check for modifications and deletions
        for filepath, baseline_hash in self.baseline.items():
            if filepath not in current_files:
                deleted.append(filepath)
            elif current_files[filepath] != baseline_hash:
                modified.append(filepath)

        # Check for new additions
        for filepath in current_files:
            if filepath not in self.baseline:
                added.append(filepath)

        return modified, added, deleted

# --- Verification Simulation ---
if __name__ == "__main__":
    import shutil

    # Setup directories for testing
    test_dir = "./fim_test_vault"
    baseline_db = "./fim_baseline.json"
    
    os.makedirs(test_dir, exist_ok=True)
    config_file = os.path.join(test_dir, "sys_config.txt")
    
    # 1. Write original file
    with open(config_file, "w") as f:
        f.write("database_port = 5432\nenforce_ssl = true")

    # Initialize FIM
    fim = FileIntegrityMonitor(watch_directory=test_dir, baseline_file_path=baseline_db)
    
    # 2. Establish Baseline (Technical Preventive/Detective preparation)
    fim.generate_baseline()

    # 3. Simulate unauthorized administrative bypass / attack tampering
    print("\n--- ATTACK SIMULATION: Tampering with sys_config.txt ---")
    with open(config_file, "w") as f:
        f.write("database_port = 5432\nenforce_ssl = false") # Disabled SSL!

    # Simulate another addition
    spy_script = os.path.join(test_dir, "malicious_listener.py")
    with open(spy_script, "w") as f:
        f.write("import socket\n# reverse shell simulation")

    # 4. Technical Scan & Detect
    mod, add, dele = fim.scan_and_verify()
    
    print("\n--- DETECTIVE AUDIT RESULTS ---")
    if mod:
        print(f"[TAMPER DETECTED] Modified files: {mod}")
    if add:
        print(f"[TAMPER DETECTED] Added files: {add}")
    if not mod and not add and not dele:
        print("[OK] System integrity verified.")

    # Cleanup temporary test files
    shutil.rmtree(test_dir, ignore_errors=True)
    if os.path.exists(baseline_db):
        os.remove(baseline_db)
```

---

## Mapping to Compliance Frameworks (NIST & ISO)

Integrating administrative guidelines with physical and logical controls is mandated by modern compliance standards:
- **NIST SP 800-53:** Focuses heavily on the detailed classification of security controls. For instance, Access Control (AC-1) represents Administrative, while (AC-2, AC-3) implement Technical gating, and Physical Protection (PE-1, PE-3) govern physical perimeters.
- **ISO 27001 Annex A:** Maps 93 security controls across 4 thematic areas: Organizational (Administrative), People (Administrative), Physical, and Technological (Technical). Selecting controls from each category ensures that no single operational deficiency can destroy your system's integrity.
