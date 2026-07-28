"""The host chip's name, for the compute clock's honesty line.

The pipeline is Python under the GIL: the Monte-Carlo draw and the GARCH optimizer
loops are single-thread bound and only the BLAS calls spill wider. So the desk names
the chip and says "1 thread" — printing the marketing core count would imply a parallel
run that is not happening.
"""

from __future__ import annotations

import platform
import re
import subprocess

_FALLBACK = "CPU"

# Marketing noise to strip from a raw brand string: trademark marks, the core count
# (misleading here, see the module docstring) and the clock suffix.
_NOISE = re.compile(
    r"\((?:R|TM|r|tm)\)|\b\d+-Core\s+Processor\b|\bProcessor\b|\bCPU\b|@\s*[\d.]+\s*GHz",
    re.IGNORECASE,
)


def _read_brand() -> str:
    """The vendor brand string for this host, or "" if it cannot be read.

    Branching on the OS because no stdlib call is reliable everywhere:
    ``platform.processor()`` gives a useful brand on macOS, the bare family on many
    Linux builds, and an identifier string on Windows.
    """
    system = platform.system()
    try:
        if system == "Windows":
            import winreg  # Windows-only stdlib module

            key = r"HARDWARE\DESCRIPTION\System\CentralProcessor\0"
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key) as handle:
                return str(winreg.QueryValueEx(handle, "ProcessorNameString")[0])
        if system == "Darwin":
            return subprocess.run(
                ["sysctl", "-n", "machdep.cpu.brand_string"],
                capture_output=True,
                text=True,
                timeout=2,
                check=True,
            ).stdout
        if system == "Linux":
            with open("/proc/cpuinfo", encoding="utf-8", errors="replace") as handle:
                for line in handle:
                    if line.lower().startswith(("model name", "hardware")):
                        return line.split(":", 1)[1]
    except Exception:  # noqa: BLE001 - a cosmetic label must never break a session
        return ""
    return ""


def cpu_label() -> str:
    """A normalized chip name, degrading to a generic label rather than raising."""
    raw = _read_brand() or platform.processor() or platform.machine()
    cleaned = re.sub(r"\s+", " ", _NOISE.sub(" ", raw or "")).strip(" ,-")
    return cleaned or _FALLBACK
