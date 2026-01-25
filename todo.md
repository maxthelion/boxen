# TODO

Panel editor

* Allow a panel to be edited.
    * This should be possible through selecting it in the 3d ui and pressing a button, or via the tree of objects (which should list panels and sub-assemblies). 
    * Editing a panel should create a new view next to the 3d view. This should show the panel as a sketch with nodes and lines. The joints should be shown.
    * The outer edges of the panel shoul allow resizing, but only ones that have no joints. Eg, a partition's front edge could be made shorter, or stick out of the box.
    * I'd like to be able to add augmentations to some edges, eg feet on a box's corners. There should be an option to mirror these augmentations so that the are symmetrical. 
    * A panel should have the option of copying the augmentations of another panel.

The joints don't seem to work properly. the fingers stick out. It looks like they might be joining on the center of the panel's width, rather than on the inside edge.

The fingers shouldn't go right to the corners, there should be a gap of around 1.5 finger widths to stop it being messy.

the tree viewer should have controls on the right for each node to view or hide it. There should also be an option to "isolate" a node so that all other nodes are hidden (with a corresponding "unisolate" function).

The svg export should have an option to fit the pieces as close together as possible. There should be an option to state the size of the laser bed. If the pieces don't fit, they should be grouped together to form multiple printable plates that can be done one by one.

the assembly changes and loses focus as soon as a property field is typed into

hit detection for selecting parts of the assembly doesn't work correctly. It appears to detect an object behind, rather than the object at the front (eg closest to the "camera")

Clicking the hide button (or isolate) doesn't change the objects that are shown in the 3d viewer -- nothing gets hidden

Label faces? F, B, L, R, T, B etc.

Save the state of the box in the URL so that it can be shared

The Faces section of assembly properties is not showing because it's overflowed.

The edges are not working correctly. Front and back panels should have fingers on all sides. left and right panels should have fingers on their top and bottom edges. Top and bottom panels should have no fingers.

Outside panels are not meeting at the correct place on the corners. The panels that meet should align on their outside face. At the moment, they intersect at the centre line of the panel's depth (eg if the panel is 6mm deep, the corners are out by 3mm).


The svg output doesn't match the faces that are generated in the 3d view.