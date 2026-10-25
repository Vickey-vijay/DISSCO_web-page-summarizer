# The client's laptop (from the client's own photos, received 26 October 2026)

These are the facts that were read from three photos of the client's screen: the Windows "System, About" page, the File Explorer drive tooltip, and `chrome://gpu`. The device name, device ID and product ID that are visible in the photo are left out on purpose; the photos are not stored in the repository.

| Item | Value | Where it was read |
|---|---|---|
| Model | HP Laptop 15-fd0xxx | System, About |
| Processor | 13th Gen Intel Core i7-1355U, 1.70 GHz (a 15-watt "U" processor: 2 fast cores, 8 efficient cores) | System, About |
| Memory | 16 GB installed (15.7 GB usable), 3200 MT/s | System, About |
| Graphics | Intel Iris Xe Graphics, built into the processor. "128 MB" is only the memory reserved for it; it shares the main memory. No separate graphics card. | System, About |
| Disk | 477 GB, Windows (C:) 363 GB free of 475 GB | System, About and File Explorer |
| Chrome | 156.0.8078.48 (Official Build, 64-bit) | `chrome://gpu` |
| WebGPU | Hardware accelerated | `chrome://gpu` |
| WebGL, Canvas, Compositing, Video decode and encode | Hardware accelerated | `chrome://gpu` |
| WebNN, Skia Graphite, Direct Rendering Display Compositor, Raw Draw, TreesInViz | Disabled | `chrome://gpu` |

## What this means for Version 2

- **The Intel path is the main path, not an edge case.** The client has no separate graphics card, so Version 2 will always run on the built-in graphics (the extension picks the smaller model on its own there).
- **Everything the extension needs is there:** Chrome is newer than 116, WebGPU is hardware accelerated, memory (16 GB) and free disk (363 GB) are far above the 8 GB and 3 GB the setup checks for. Whether the Iris Xe chip offers the 16-bit shader feature (`shader-f16`) is not shown by these photos; the developer laptop's Intel chip of the same generation (Gen 12) does.
- **Speed will be close to the developer laptop's Intel numbers, not the NVIDIA ones.** The Iris Xe in this processor has more execution units than the developer laptop's Intel UHD chip, but the processor is a 15-watt part, so no faster result can be promised until it is measured on that laptop (see [MANUAL_SMOKE_TEST.md](MANUAL_SMOKE_TEST.md)).
- `setup.bat --gpu` has nothing to switch on this laptop (there is only one graphics chip).
