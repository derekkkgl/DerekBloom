"""API errors. Each one maps to a real HTTP status and an error code in the response."""


class ApiError(Exception):
    status = 500
    code = "internal_error"

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class BadRequest(ApiError):
    """The caller sent something invalid (bad ticker, unknown range)."""

    status = 400
    code = "bad_request"


class NotFound(ApiError):
    """The source has no data for this ticker."""

    status = 404
    code = "not_found"


class UpstreamError(ApiError):
    """Yahoo, CoinGecko, or a news feed failed or rate-limited us."""

    status = 502
    code = "upstream_error"
