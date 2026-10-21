"""Fixed lists behind the world-markets screens: FX, CMDTY, IMAP, and WMAP."""

from dataclasses import dataclass

# --- FX ----------------------------------------------------------------------


@dataclass(frozen=True)
class FxPair:
    code: str
    name: str
    symbol: str  # Yahoo symbol
    usd_per_unit: bool  # True when Yahoo quotes it as dollars per unit (EURUSD=X); False for units per dollar (JPY=X)


FX_PAIRS: list[FxPair] = [
    FxPair("EUR", "Euro", "EURUSD=X", True),
    FxPair("JPY", "Japanese yen", "JPY=X", False),
    FxPair("GBP", "British pound", "GBPUSD=X", True),
    FxPair("CHF", "Swiss franc", "CHF=X", False),
    FxPair("AUD", "Australian dollar", "AUDUSD=X", True),
    FxPair("CAD", "Canadian dollar", "CAD=X", False),
    FxPair("CNY", "Chinese yuan", "CNY=X", False),
    FxPair("SGD", "Singapore dollar", "SGD=X", False),
    FxPair("PHP", "Philippine peso", "PHP=X", False),
]

DXY_SYMBOL = "DX-Y.NYB"

# Rows and columns of the cross-rate matrix.
MATRIX_CODES = ["USD", "EUR", "GBP", "JPY", "CHF", "AUD", "CAD", "CNY", "SGD", "PHP"]

# --- CMDTY -------------------------------------------------------------------


@dataclass(frozen=True)
class Commodity:
    symbol: str
    name: str
    unit: str  # what one price is for, after `scale`
    scale: float = 1.0  # Yahoo quotes grains in US cents; 0.01 turns that into dollars


COMMODITIES: list[Commodity] = [
    Commodity("GC=F", "Gold", "per troy ounce"),
    Commodity("SI=F", "Silver", "per troy ounce"),
    Commodity("CL=F", "WTI crude oil", "per barrel"),
    Commodity("NG=F", "Natural gas", "per million BTU"),
    Commodity("HG=F", "Copper", "per pound"),
    Commodity("ZW=F", "Wheat", "per bushel", 0.01),
]

# --- IMAP --------------------------------------------------------------------


@dataclass(frozen=True)
class Fund:
    symbol: str
    name: str
    sector_key: str | None = None  # key in SPY's funds_data.sector_weightings


SECTOR_SOURCE = "SPY"  # the S&P 500's sector weights come from this fund

SECTOR_ETFS: list[Fund] = [
    Fund("XLK", "Technology", "technology"),
    Fund("XLF", "Financials", "financial_services"),
    Fund("XLV", "Health care", "healthcare"),
    Fund("XLY", "Consumer discretionary", "consumer_cyclical"),
    Fund("XLC", "Communication services", "communication_services"),
    Fund("XLI", "Industrials", "industrials"),
    Fund("XLP", "Consumer staples", "consumer_defensive"),
    Fund("XLE", "Energy", "energy"),
    Fund("XLU", "Utilities", "utilities"),
    Fund("XLRE", "Real estate", "realestate"),
    Fund("XLB", "Materials", "basic_materials"),
]

WORLD_ETFS: list[Fund] = [
    Fund("VT", "Whole world"),
    Fund("VXUS", "World outside the US"),
    Fund("EEM", "Emerging markets"),
    Fund("EWJ", "Japan"),
    Fund("FXI", "China large caps"),
    Fund("INDA", "India"),
]

# --- WMAP --------------------------------------------------------------------


@dataclass(frozen=True)
class WorldMarket:
    symbol: str
    index: str
    country: str
    code: str  # two-letter country code shown on the tile
    region: str
    col: int  # tile position on the map grid, 0 = west / top
    row: int


# One square per market, placed roughly where it sits on the globe.
WORLD_MARKETS: list[WorldMarket] = [
    WorldMarket("^GSPTSE", "S&P/TSX Composite", "Canada", "CA", "Americas", 0, 0),
    WorldMarket("^GSPC", "S&P 500", "United States", "US", "Americas", 0, 1),
    WorldMarket("^MXX", "IPC", "Mexico", "MX", "Americas", 0, 2),
    WorldMarket("^BVSP", "Bovespa", "Brazil", "BR", "Americas", 1, 4),
    WorldMarket("^FTSE", "FTSE 100", "United Kingdom", "GB", "Europe and Africa", 2, 0),
    WorldMarket("^AEX", "AEX", "Netherlands", "NL", "Europe and Africa", 3, 0),
    WorldMarket("^GDAXI", "DAX", "Germany", "DE", "Europe and Africa", 4, 0),
    WorldMarket("^FCHI", "CAC 40", "France", "FR", "Europe and Africa", 3, 1),
    WorldMarket("^SSMI", "SMI", "Switzerland", "CH", "Europe and Africa", 4, 1),
    WorldMarket("^IBEX", "IBEX 35", "Spain", "ES", "Europe and Africa", 2, 2),
    WorldMarket("FTSEMIB.MI", "FTSE MIB", "Italy", "IT", "Europe and Africa", 4, 2),
    WorldMarket("^J203.JO", "All Share", "South Africa", "ZA", "Europe and Africa", 4, 5),
    WorldMarket("^BSESN", "BSE Sensex", "India", "IN", "Asia-Pacific", 5, 2),
    WorldMarket("000001.SS", "Shanghai Composite", "China", "CN", "Asia-Pacific", 6, 1),
    WorldMarket("^KS11", "KOSPI", "South Korea", "KR", "Asia-Pacific", 7, 1),
    WorldMarket("^N225", "Nikkei 225", "Japan", "JP", "Asia-Pacific", 8, 1),
    WorldMarket("^HSI", "Hang Seng", "Hong Kong", "HK", "Asia-Pacific", 6, 2),
    WorldMarket("^TWII", "TAIEX", "Taiwan", "TW", "Asia-Pacific", 7, 2),
    WorldMarket("^KLSE", "FTSE Bursa Malaysia KLCI", "Malaysia", "MY", "Asia-Pacific", 6, 3),
    WorldMarket("PSEI.PS", "PSEi", "Philippines", "PH", "Asia-Pacific", 7, 3),
    WorldMarket("^STI", "Straits Times", "Singapore", "SG", "Asia-Pacific", 6, 4),
    WorldMarket("^JKSE", "Jakarta Composite", "Indonesia", "ID", "Asia-Pacific", 7, 4),
    WorldMarket("^AXJO", "S&P/ASX 200", "Australia", "AU", "Asia-Pacific", 7, 5),
    WorldMarket("^NZ50", "NZX 50", "New Zealand", "NZ", "Asia-Pacific", 8, 6),
]

WORLD_REGIONS = ["Americas", "Europe and Africa", "Asia-Pacific"]
