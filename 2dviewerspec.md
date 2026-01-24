# Boxen Joints – Application Design Notes

## Panels and Joints

* Panels should have joint lines that are **separate from the edge of the panels**.
* When a new assembly is being previewed, there should be a **line that runs along its primary axis** to show how that will work.

---

## Plane Selection and Subdivisions

* When **two planes are selected**, there should be an option to **subdivide** if the void between them contains no subdivisions.
* Subdivision axis options should be **limited to the two planes perpendicular to the panel**, following the visual rule about **open faces**.

---

## Editing Panels

* When a **panel is selected**, an option should exist to **edit it in a 2D sketch view**.

---

## 2D Sketch View Behaviour

The 2D sketch view should:

* Show the **points and lines** of the panel or face.
* Show the **joints** and the **fingers / holes**.
* Show all lines that are:

  * **Generated from parent dimensions** in **blue**
  * **Editable / changeable** in **orange**

### Edge Line Rules

An edge line can be moved according to rules:

* If it **joins an open face**, it can be moved **in or out**.

  * Movement inward should be **limited** so that it does not hit a joint on the opposite side.
* If it is a **female joint**, it can be moved **outwards only**.
* If it is **male**, it cannot be moved in or out.

---

## Assemblies, Components and Inheritance

* Assemblies and components should have **inherited values**.

* If a panel is moved because:

  * The outer dimensions change, or
  * It is repositioned,

  then the system should **recalculate**:

  * Subdivisions in voids
  * The voids themselves
  * Sub-assemblies

* Subdivisions should, by default, be placed at **percentage intervals of a space** so that they can adapt when dimensions change.

---

## Editable Areas on Panels

* There should be **highlighted rectangles** on a panel where the face can be subtracted **without affecting joints**.
* This should have a **minimum distance of 1× material thickness** from each joint with a **closed panel**.
* On a joint with an **open panel**, this editable area can go **all the way to the edge**.

---

## Additional Assembly Features

* There should be an option for **adding feet to an assembly**:

  * The bottom surface is made on all sides.
  * The planes on all the sides that touch it have their material **extruded downwards**.

---

## Corners and Finishing

* Corners should allow **chamfers and fillets** if there is **enough editable material** to do so.
