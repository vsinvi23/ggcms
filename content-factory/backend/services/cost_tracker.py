"""AI generation cost tracking against configured budget caps.

Accumulates a running cost estimate for a generation job and enforces the
per-item cap (settings.max_cost_per_content_unit) and the monthly cap
(settings.max_monthly_ai_budget), raising BudgetExceededError instead of
silently letting a job proceed past either limit.
"""

from backend.configs.settings import settings


class BudgetExceededError(Exception):
    """Raised when a generation job would exceed a configured budget cap."""

    error_type = "BUDGET_EXCEEDED"

    def __init__(self, message: str, *, cap_type: str, current: float, limit: float):
        super().__init__(message)
        self.cap_type = cap_type
        self.current = current
        self.limit = limit

    def to_dict(self) -> dict:
        return {
            "error_type": self.error_type,
            "cap_type": self.cap_type,
            "current": self.current,
            "limit": self.limit,
            "message": str(self),
        }


class CostTracker:
    """Tracks accumulated AI generation cost for a single job against
    both the per-item cost cap and the shared monthly AI budget cap.

    `monthly_spend_so_far` should be supplied by the caller (e.g. read
    from a running total persisted elsewhere) so this tracker can decide
    whether adding this job's cost would blow through the monthly cap.
    """

    def __init__(
        self,
        job_id: str,
        *,
        monthly_spend_so_far: float = 0.0,
        max_cost_per_content_unit: float | None = None,
        max_monthly_ai_budget: float | None = None,
    ):
        self.job_id = job_id
        self.monthly_spend_so_far = monthly_spend_so_far
        self.max_cost_per_content_unit = (
            max_cost_per_content_unit
            if max_cost_per_content_unit is not None
            else settings.max_cost_per_content_unit
        )
        self.max_monthly_ai_budget = (
            max_monthly_ai_budget
            if max_monthly_ai_budget is not None
            else settings.max_monthly_ai_budget
        )
        self.job_cost = 0.0

    def add_cost(self, amount: float) -> float:
        """Add `amount` to this job's running cost.

        Raises BudgetExceededError if the job's own running total would
        exceed the per-item cap, or if adding it to the monthly spend
        so far would exceed the monthly cap. The failed amount is not
        applied on raise.

        Returns the new job running total on success.
        """
        if amount < 0:
            raise ValueError("cost amount must be non-negative")

        projected_job_cost = self.job_cost + amount
        if projected_job_cost > self.max_cost_per_content_unit:
            raise BudgetExceededError(
                f"Job '{self.job_id}' cost {projected_job_cost:.4f} would exceed "
                f"per-item cap {self.max_cost_per_content_unit:.4f}",
                cap_type="per_item",
                current=projected_job_cost,
                limit=self.max_cost_per_content_unit,
            )

        projected_monthly = self.monthly_spend_so_far + projected_job_cost
        if projected_monthly > self.max_monthly_ai_budget:
            raise BudgetExceededError(
                f"Job '{self.job_id}' would push monthly spend to "
                f"{projected_monthly:.4f}, exceeding monthly cap "
                f"{self.max_monthly_ai_budget:.4f}",
                cap_type="monthly",
                current=projected_monthly,
                limit=self.max_monthly_ai_budget,
            )

        self.job_cost = projected_job_cost
        return self.job_cost

    def remaining_per_item_budget(self) -> float:
        return max(0.0, self.max_cost_per_content_unit - self.job_cost)

    def remaining_monthly_budget(self) -> float:
        return max(
            0.0,
            self.max_monthly_ai_budget - (self.monthly_spend_so_far + self.job_cost),
        )
