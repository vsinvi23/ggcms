# Quantitative Risk Management: Evaluating Risk Acceptance vs. Mitigation with ALE/SLE

## The Problem: The Ineffectiveness of Qualitative "Heat Maps"
Many security organizations present risk using subjective 5x5 color-coded "heat maps" (Red/Yellow/Green) representing qualitative metrics like "High Probability" and "Severe Impact". 

```
Qualitative Heat Map (Subjective & Non-Actionable)
+-----+-----+-----+-----+-----+
| Low | Med | High| Cri | Cri |  <-- "Critical"? What does this mean in dollars?
+-----+-----+-----+-----+-----+
```

These maps fail at the executive level:
1. **Budget Incompatibility:** CFOs cannot evaluate whether to allocate $150,000 for a security control based on the word "High".
2. **Resource Misallocation:** Spending $100,000 annually to protect an internal system whose total replacement cost and operational loss is only $10,000.
3. **Vague Trade-offs:** Security leaders cannot defend when to **Accept** a risk versus when to **Mitigate** it.

To make logical, business-aligned security decisions, engineers must use **Quantitative Risk Management** models, translating technical vulnerabilities into annualized financial exposures.

---

## Quantitative Risk Formulas: The Mathematics of Loss

Quantitative modeling operates on structured, standardized mathematical inputs:

$$\text{Single Loss Expectancy (SLE)} = \text{Asset Value (AV)} \times \text{Exposure Factor (EF)}$$

$$\text{Annualized Loss Expectancy (ALE)} = \text{Single Loss Expectancy (SLE)} \times \text{Annualized Rate of Occurrence (ARO)}$$

### Definitions:
- **Asset Value (AV):** The total financial value of an asset (reconstruction costs, legal fines, brand damage, lost revenue during downtime).
- **Exposure Factor (EF):** The percentage of loss that a realized threat would cause to the asset (ranging from $0.0$ to $1.0$).
- **Single Loss Expectancy (SLE):** The dollar loss expected from a single occurrence of a threat.
- **Annualized Rate of Occurrence (ARO):** How often the threat is statistically expected to materialize in a single year (e.g., once every 5 years = $0.2$, twice a year = $2.0$).
- **Annualized Loss Expectancy (ALE):** The projected annual cost of the risk if left unmitigated.

---

## Cost-Benefit Analysis (CBA) of Controls

When deciding how to treat a risk, you evaluate the financial return of a proposed security control:

$$\text{Control Value / ROI} = (\text{ALE}_{\text{Before}} - \text{ALE}_{\text{After}}) - \text{Annual Cost of Control}$$

- If the ROI is **Positive**, you should **Mitigate** the risk.
- If the ROI is **Negative** (i.e., the control costs more than the risk reduction it provides), you should **Accept** or **Transfer** (insure) the risk.

```
                  +-----------------------------------+
                  |      Calculate Baseline ALE       |
                  +-----------------+-----------------+
                                    |
            +-----------------------+-----------------------+
            |                                               |
            v                                               v
  Control ROI > $0                                Control ROI <= $0
+-----------------------+                       +-----------------------+
|     MITIGATE RISK     |                       |      ACCEPT RISK      |
| (Implement Control)   |                       | (Document & Monitor)  |
+-----------------------+                       +-----------------------+
```

---

## Technical Implementation: Quantitative Risk Engine in Python

Below is a Python risk analysis engine. It models enterprise assets, threats, and proposed controls, and outputs an executive investment recommendation report.

```python
from typing import Dict, List, Any

class Asset:
    def __init__(self, name: str, value: float):
        self.name = name
        self.value = value # AV (Asset Value)

class ThreatScenario:
    def __init__(self, id: str, asset: Asset, exposure_factor: float, annual_rate: float):
        self.id = id
        self.asset = asset                     # Link to Asset
        self.exposure_factor = exposure_factor # EF (0.0 to 1.0)
        self.annual_rate = annual_rate         # ARO (Threat frequency per year)

    def calculate_sle(self) -> float:
        """SLE = AV * EF"""
        return self.asset.value * self.exposure_factor

    def calculate_ale(self) -> float:
        """ALE = SLE * ARO"""
        return self.calculate_sle() * self.annual_rate

class MitigatingControl:
    def __init__(self, name: str, annual_cost: float, risk_reduction_pct: float):
        self.name = name
        self.annual_cost = annual_cost           # Total Cost of Ownership (TCO) per year
        self.risk_reduction_pct = risk_reduction_pct # Reduction of ALE (0.0 to 1.0)

class QuantitativeRiskEngine:
    @staticmethod
    def evaluate_scenario(scenario: ThreatScenario, proposed_control: MitigatingControl) -> Dict[str, Any]:
        baseline_sle = scenario.calculate_sle()
        baseline_ale = scenario.calculate_ale()

        # Calculate ALE after mitigation
        mitigated_ale = baseline_ale * (1.0 - proposed_control.risk_reduction_pct)
        ale_savings = baseline_ale - mitigated_ale
        
        # Cost-Benefit Analysis (CBA)
        net_savings_roi = ale_savings - proposed_control.annual_cost

        recommendation = "MITIGATE" if net_savings_roi > 0 else "ACCEPT"

        return {
            "asset_name": scenario.asset.name,
            "threat_id": scenario.id,
            "baseline_sle": baseline_sle,
            "baseline_ale": baseline_ale,
            "mitigated_ale": mitigated_ale,
            "control_name": proposed_control.name,
            "control_cost": proposed_control.annual_cost,
            "net_roi": net_savings_roi,
            "decision": recommendation
        }

# --- Verification Simulation ---
if __name__ == "__main__":
    # Define Enterprise Assets
    user_db = Asset("Customer PII Database", value=2500000.0) # $2.5 Million (includes legal and reputational value)
    internal_wiki = Asset("Internal Wiki", value=15000.0)      # $15 Thousand

    # Define Threat Scenarios
    # Scenario A: Ransomware encrypts the PII Database. EF=0.40 (40% loss of availability/records). Occurs once every 10 years (ARO=0.1)
    db_ransomware = ThreatScenario("TS-DB-Ransomware", user_db, exposure_factor=0.40, annual_rate=0.1)

    # Scenario B: Minor DDoS on Wiki. EF=0.10. Occurs twice a year (ARO=2.0)
    wiki_ddos = ThreatScenario("TS-Wiki-DDoS", internal_wiki, exposure_factor=0.10, annual_rate=2.0)

    # Define Proposed Mitigating Controls
    # Control A: High-tier Endpoint Detection and Response (EDR) + Vaulted Backups
    edr_control = MitigatingControl("Enterprise EDR & Vault Backup", annual_cost=40000.0, risk_reduction_pct=0.85)

    # Control B: Enterprise Anti-DDoS subscription for the Wiki
    ddos_control = MitigatingControl("Dedicated Wiki DDoS Shield", annual_cost=10000.0, risk_reduction_pct=0.90)

    # Execute Quantitative Evaluations
    engine = QuantitativeRiskEngine()
    
    report_a = engine.evaluate_scenario(db_ransomware, edr_control)
    report_b = engine.evaluate_scenario(wiki_ddos, ddos_control)

    # Format Output
    for rep in [report_a, report_b]:
        print(f"==================================================")
        print(f"RISK ANALYSIS FOR: {rep['asset_name']} ({rep['threat_id']})")
        print(f"==================================================")
        print(f"  Asset Value (AV):             ${user_db.value if rep['asset_name'] == 'Customer PII Database' else internal_wiki.value:,.2f}")
        print(f"  Single Loss Expectancy (SLE): ${rep['baseline_sle']:,.2f}")
        print(f"  Baseline Annual Loss (ALE):   ${rep['baseline_ale']:,.2f}")
        print(f"  Proposed Control:             {rep['control_name']}")
        print(f"  Control Cost (Annual):        ${rep['control_cost']:,.2f}")
        print(f"  Projected Mitigated ALE:      ${rep['mitigated_ale']:,.2f}")
        print(f"  Net Investment ROI:           ${rep['net_roi']:,.2f}")
        print(f"  RECOMMENDED DECISION:         [{rep['decision']}]")
        if rep['decision'] == "ACCEPT":
            print(f"  RATIONALE: Control cost exceeds potential annual risk savings. Risk should be formally Accepted.")
        else:
            print(f"  RATIONALE: Control provides positive net financial savings. Mitigate immediately.")
        print()
```

---

## Strategic Risk Treatment Framework

Once quantitative metrics are established, organizations must select from four treatment categories:
- **Mitigation:** Deploy technical or administrative controls when ROI is positive.
- **Acceptance:** Document and sign off on the risk when the cost of mitigation is higher than the loss expectancy.
- **Transference:** Buy cybersecurity insurance or utilize third-party vendors (SaaS) to transfer financial exposure to another entity.
- **Avoidance:** Shut down the high-risk service or asset entirely (e.g., deciding not to store customer credit cards, but using Stripe instead).
