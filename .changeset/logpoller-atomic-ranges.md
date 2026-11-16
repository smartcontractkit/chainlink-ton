---
"chainlink-ton": patch
---

LogPoller: save each processed block range in a single database transaction so a crash or restart can no longer leave gaps.