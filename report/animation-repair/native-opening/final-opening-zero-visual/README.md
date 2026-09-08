# Opening-only blur removal: final visual check

Reviewed **all 107 original decoded frames**, across two opening/return cycles. The source feed now stays clear during Android opening; returning still blurs it with radius 4. Image/page geometry and duration remain unchanged.

No full-page blank, endpoint white flash, duplicate cover, or source-image hole was observed. The restored feed is clear by frame 34 / **5.058922 s**, and frame 91 / **12.295944 s**. Subsequent feed frames remain stable.

The first opening still briefly shows a gray hero backdrop (frames 12–14, 1.062867–1.125444 s); the photo appears by frame 15, 1.199689 s. The second opening already shows the photo during expansion. This readiness variation remains unresolved. Some coarse return geometry steps remain; no closing performance improvement is claimed.

[Video](opening-blur-zero-final.mp4) · [Original timestamps](opening-blur-zero-final-pts.json) · [Sheet 1](opening-blur-zero-final-sheet-0.jpg) · [Sheet 2](opening-blur-zero-final-sheet-1.jpg) · [Sheet 3](opening-blur-zero-final-sheet-2.jpg) · [Structured findings](findings.json)

These are emulator recordings with variable capture cadence, not phone FPS or tap-to-photon measurements. Two cycles cannot establish broader native/lifecycle reliability.
