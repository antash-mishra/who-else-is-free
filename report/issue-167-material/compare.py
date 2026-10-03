"""Read original native captures; never rewrite screenshot pixels."""
from pathlib import Path
import numpy as np
from PIL import Image

HERE = Path(__file__).parent

def roi(name, y):
    return np.asarray(Image.open(HERE / name))[y:y+120, 656:776, :3].astype(float)

y, x = np.mgrid[:120, :120]
# Stay inside the badge, exclude foreground bounding box and outer shadow.
mask = (x - 59.5)**2 + (y - 59.5)**2 < 52**2
mask &= ~((x >= 27) & (x < 95) & (y >= 27) & (y < 99))
for label, ios, iy, android, ay in [
    ('gradient reference', 'ios-reference.png', 978, 'android-candidate.png', 978),
    ('photo / Edit Profile', 'ios-edit-profile-photo.png', 1140, 'android-edit-profile-photo.png', 1095),
    ('gradient / Onboarding', 'ios-onboarding.png', 1050, 'android-onboarding.png', 1050),
]:
    difference = np.abs(roi(ios, iy) - roi(android, ay))[mask]
    print(label, 'pixels=', mask.sum(), 'MAE=', round(difference.mean(), 3),
          'p95=', np.percentile(difference, 95), 'max=', difference.max())
