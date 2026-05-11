V2()

add(a, b, out?)
sub(a, b, out?)
scale(a, s, out?)

dot(a, b)

len(a)
norm(a, out?)

lerp(a, b, t, out?)

V3()

add(a, b, out?)
sub(a, b, out?)
mul(a, b, out?)         // component-wise
scale(a, s, out?)

dot(a, b)
cross(a, b, out?)

len(a)
norm(a, out?)

distance(a, b)

lerp(a, b, t, out?)

transformM4(v, m, out?)
transformQ(v, q, out?)

V4()

add(a, b, out?)
sub(a, b, out?)
scale(a, s, out?)

dot(a, b)

len(a)
norm(a, out?)

transformM4(v, m, out?)

Q()

identity(out?)
copy(a, out?)

mul(a, b, out?)

norm(a, out?)
invert(a, out?)

from.axisAngle(axis, rad, out?)
from.euler(x, y, z, out?)

toM4(q, out?)

lerp(a, b, t, out?)
slerp(a, b, t, out?)
nlerp(a, b, t, out?)

M4()

mul(a, b, out?)

transpose(a, out?)
invert(a, out?)