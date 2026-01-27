I want to refactor this application to separate it into three clear layers:

OO Model Engine (authoritative state)

Serializable Snapshot Layer (for React)

Action / Command Layer (UI → engine updates)

The goal is that React never holds or mutates class instances. React should render plain serialized data derived from an object-oriented hierarchical model.

Architectural Goals
The application models 3D shapes in a hierarchy

Shapes exist as nodes in a parent/child tree

Changing a parent’s dimensions or transform affects its children

Each node has:

input properties (e.g. width, height, transform, etc.)

derived properties (world transform, effective dimensions, bounding boxes)

This logic must live in an OO model layer using classes.

1) Model Layer (Classes)

Create/keep class-based nodes such as:

BaseNode

GroupNode

BoxNode

etc.

These classes:

Maintain parent/child relationships

Store mutable internal state

Implement logic for:

dimension changes

transform propagation

derived value calculation

Each node must have a stable unique id

The engine should maintain a Map<id, node> for fast lookup

These classes must not be used directly in React state.

2) Snapshot / Serialization Layer

Each node must implement something like:

serialize(): NodeSnapshot


Where NodeSnapshot is a plain JSON-serializable object:

type NodeSnapshot = {
  id: string
  kind: string
  props: { ...inputProps }
  derived: { ...computedProps }
  children: NodeSnapshot[]
}


This snapshot is what React renders.

Important:

No methods

No class instances

Only data

Includes both input and derived values

The entire tree must be serializable by walking from the root.

3) Action / Command Layer (UI → engine)

The UI must not modify snapshots directly.

Instead, the UI sends actions like:

{
  type: "SET_DIMENSION",
  targetId: string,
  payload: { width: number }
}


Create an engine-level dispatcher:

dispatch(action): NodeSnapshot


This should:

Look up the node by id

Apply the mutation to the correct class instance

Recompute affected subtree (parent → children propagation)

Return a fresh serialized snapshot

4) React Integration

Refactor React so that:

The engine is created once and stored in a useRef

React holds only:

const [snapshot, setSnapshot] = useState<NodeSnapshot>()


UI interactions call:

const newSnapshot = engine.dispatch(action)
setSnapshot(newSnapshot)


React components render only from NodeSnapshot.

React must never:

store nodes

call methods on nodes

mutate nodes

5) Derived Values Responsibility

All derived values (world transforms, effective sizes, bounding boxes, etc.) must be computed in the model layer, not in React.

React should be a pure renderer of precomputed data.

6) Constraints

Maintain the existing hierarchy and shape logic

Preserve current behaviour

Do not simplify the model into plain objects — keep it OO internally

Focus on clean separation between engine and UI

Prepare the system for future undo/redo by using action-based updates

Refactor Objective

After the refactor:

The OO model tree is the single source of truth

React renders a serialized view of that tree

All updates flow through actions

Parent → child dependency logic lives entirely in the engine

React becomes a pure projection of engine state

You can now refactor the existing codebase to follow this structure.