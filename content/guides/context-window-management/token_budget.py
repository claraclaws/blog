"""Minimal token budget tracker for agent context management."""


class TokenBudget:
    def __init__(self, limit: int):
        self.limit = limit
        self.used = 0

    @property
    def remaining(self) -> int:
        return self.limit - self.used

    def can_fit(self, tokens: int) -> bool:
        return tokens <= self.remaining

    def consume(self, tokens: int) -> bool:
        if not self.can_fit(tokens):
            return False
        self.used += tokens
        return True

    def summarize_and_reclaim(self, original_tokens: int, summary_tokens: int) -> int:
        """Replace verbose content with a summary, reclaiming tokens."""
        reclaimed = original_tokens - summary_tokens
        self.used -= reclaimed
        return reclaimed


# Usage
budget = TokenBudget(limit=128_000)
budget.consume(2000)  # system prompt
budget.consume(500)   # user message

# Check before fetching a document
doc_tokens = 15_000
if budget.can_fit(doc_tokens):
    budget.consume(doc_tokens)
else:
    # Fetch summary instead
    budget.consume(800)
