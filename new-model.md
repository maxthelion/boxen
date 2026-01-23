# New model of the box components

when an assembly is created, a bounding box is created with width, height and depth. This will determine where the outer faces will join with one another.

an assembly has 3 axes that sit perpendicular to the faces of the box. These could be called x, y and z. An assembly has 12 outer joints where the outer panels meet. There are a maximum of 24 edge joints that need to mate together. there will be more edges internally when the assembly is subdivided.

Every edge is parallel with one of these axes. For each of the 3 axes, there should be a set of finger points generated when the bounding box of the assembly is defined or changed.

These finger points are positions along the axis, relative to its intersection of the outer bounding box. There should be a finite number of inner finger points allowed by the dimensions of the outer box. joints can extend beyoond the box infinitely, as long as they have the correct distance between the outside of the bounding box and the first finger.

There are a set of rules for generating the fingers. There are two main variables:

* A minimum distance from the outer box
* The length of the fingers

The maximum length of the inner joint should be the same as the outer measurement of the box (depth, height, width), minus 2 times material thickness. 

The finger/hole pattern should be symmetric, starting and ending with a finger (OUT) section. This means an odd number of finger sections and an even number of hole sections (e.g., OUT-IN-OUT or OUT-IN-OUT-IN-OUT).

To calculate finger points: 2 times the minimum distance should be removed from the joint length. The remaining length should be divided by the finger length to get the number of sections. If the count is even, subtract 1 to make it odd. If there is a remainder after division, that remainder should be distributed equally to both ends (added to the actual distance from the outer box, creating the "finger point inner offset").

All edges running parallel with each of the 3 axes of the assembly should use the same finger points to render the fingers and tabs. 

If the panel is inset so that one edge of the joint is shorter than the other, then only the finger points which are possible on both panels should be used.

If the joint is bigger than the bounding box, new fingers can be generated infinitely, starting from finger point inner offset of that axis.

joint edges can be male or female. female joints can exist in the middle of a plane (can have tabs inserted into it). Male joints can only exist on corners, otherwise physical assembly could become impossible. Section dividers always have male joints on the edge to meet the panels they intersect.

If divider panels intersect one another within a space, they should have a new kind of joint with vertical cuts of material thickness extending up and down respectively in each face so they can be slotted together in a cross shape.

An assembly should have a central axis chosen out of the 3 options. This determines the female or male tabbedness of the panels. The panels perpendicular to the chosed axis (we'd called them lids previously, but there may be a better name), should have the same gender of tab on all edges. Side panels should accommodate this. They should have the same pattern with their opposite counterpart for symmetry.

Finger points denote transitions between finger/whole states, in or out.

"minimum distance from outer box" is measured from The bounding box corner (world space).

If one end of an edge meets an open face (no mating panel), does it still use min_distance, or can fingers extend closer to that end?   still uses min_distance.

Sub assemblies should create their own finger points based on their bounding box.

Dividers should use the finger points of their nearest assembly ancestor.

The odd number rule may actually be incorrect. It's more that there should be an odd number of slots for symmetry, eg it shouldn't be: out in out in. It should favour out in out.

A joint could extend beyond the bounding box, if:

* two joined faces adacent to an open panel had their top edge extended above the other panels. In this case, it might actually be better to do away with the min distance around the boundary line being crossed, and continue with uniform finger spacing. 
* A sub assembly exists in a boundary defined by the void it was created in. However, it can be extended outwards if it has an open face to emerge out of. The same observation as the bullet above stands here.

                                                                                                                                                                                                                                                 