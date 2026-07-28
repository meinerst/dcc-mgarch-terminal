"""The live desk path: a seeded order tape over real bars, priced by the model.

The public surface is deliberately small. Everything below it — the bar grid, the
order tape, one bar's fit — is an implementation detail of a *session*.

    build_session_meta  pass 1 (grid + tape), milliseconds, no fits
    fit_one_bar         pass 2, one bar on demand, stateless in the seed
    record_session      the whole session, fits included, frozen for replay
    SessionSpec         the knobs, defaulted to the dialled constants
"""

from .session import SessionSpec, build_session_meta, fit_one_bar, record_session

__all__ = ["SessionSpec", "build_session_meta", "fit_one_bar", "record_session"]
