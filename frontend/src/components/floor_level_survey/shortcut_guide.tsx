import "./shortcut_guide.css";


interface ShortcutGuideProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}


interface GroupedShortcut {
    keys: string[];
    label: string;
}

const groups: { title: string; items: GroupedShortcut[] }[] = [
    {
        title: "Tools",
        items: [
            { keys: ["V"], label: "Select tool" },
            { keys: ["W"], label: "Draw wall" },
            { keys: ["P"], label: "Draw point" },
        ],
    },
    {
        title: "Edit",
        items: [
            { keys: ["Delete"], label: "Delete selected (or last wall segment while drawing)" },
            { keys: ["Esc"], label: "Cancel / clear selection" },
            { keys: ["↑", "/", "→"], label: "+0.1 to selected point height" },
            { keys: ["↓", "/", "←"], label: "−0.1 to selected point height" },
            { keys: ["Ctrl", "Z"], label: "Undo" },
            { keys: ["Ctrl", "Y"], label: "Redo" },
        ],
    },
    {
        title: "Drawing",
        items: [
            { keys: ["Click"], label: "Place a wall corner / point (snaps to grid)" },
            { keys: ["Double-click"], label: "Finish wall polygon" },
            { keys: ["Click"], label: "On existing point: selects it instead of adding" },
        ],
    },
    {
        title: "Select tool",
        items: [
            { keys: ["Click"], label: "Select a point" },
            { keys: ["Drag"], label: "On a point: move it (snaps to grid)" },
            { keys: ["Drag"], label: "On empty space: pan the workspace" },
        ],
    },
    {
        title: "Heights",
        items: [
            { keys: ["Wheel"], label: "Adjust selected point height by ±0.1" },
            { keys: ["↑", "/", "↓"], label: "Adjust selected point height by ±0.1" },
        ],
    },
    {
        title: "View",
        items: [
            { keys: ["Space", "+", "Drag"], label: "Pan" },
            { keys: ["Middle click", "+", "Drag"], label: "Pan" },
            { keys: ["Wheel"], label: "Zoom to cursor (when no selection)" },
            { keys: ["+"], label: "Zoom in" },
            { keys: ["-"], label: "Zoom out" },
            { keys: ["0", "/", "F"], label: "Frame all / reset" },
            { keys: ["G"], label: "Toggle major grid" },
            { keys: ["M"], label: "Toggle overview map" },
            { keys: ["C"], label: "Toggle contour lines" },
            { keys: ["?"], label: "Toggle this guide" },
        ],
    },
];


function ShortcutGuide({ open, onOpenChange }: ShortcutGuideProps) {
    if (!open) return null;

    return (
        <div className="shortcut-guide-panel" role="dialog" aria-label="Keyboard shortcuts">
            <div className="shortcut-guide-header">
                <span>Keyboard Shortcuts</span>
                <button
                    type="button"
                    className="shortcut-guide-close"
                    onClick={() => onOpenChange(false)}
                    aria-label="Close shortcuts">
                    ×
                </button>
            </div>
            <div className="shortcut-guide-body">
                {groups.map(group => (
                    <div className="shortcut-guide-group" key={group.title}>
                        <div className="shortcut-guide-group-title">{group.title}</div>
                        <div className="shortcut-guide-grid">
                            {group.items.map((item, i) => (
                                <div className="shortcut-guide-row" key={i}>
                                    <div className="shortcut-guide-keys">
                                        {item.keys.map((k, j) =>
                                            k === "+" || k === "/" || k === "—" ? (
                                                <span className="shortcut-guide-sep" key={j}>{k}</span>
                                            ) : (
                                                <kbd key={j}>{k}</kbd>
                                            )
                                        )}
                                    </div>
                                    <div className="shortcut-guide-label">{item.label}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}


export default ShortcutGuide;
