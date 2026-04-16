import { useEffect, useRef } from "react";
import "./context_menu.css";


export interface ContextMenuItem {
    id: string;
    label: string;
    icon?: React.ReactNode;
    destructive?: boolean;
    disabled?: boolean;
    onSelect: () => void;
}


interface ContextMenuProps {
    x: number;
    y: number;
    items: ContextMenuItem[];
    onClose: () => void;
}


function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
    const rootRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const onDocMouseDown = (e: MouseEvent) => {
            if (!rootRef.current) return;
            if (!rootRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("mousedown", onDocMouseDown, true);
        window.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDocMouseDown, true);
            window.removeEventListener("keydown", onKey);
        };
    }, [onClose]);

    return (
        <div
            ref={rootRef}
            className="fls-context-menu"
            role="menu"
            style={{ left: x, top: y }}
            onContextMenu={e => e.preventDefault()}>
            {items.map(item => (
                <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    className={`fls-context-menu-item${item.destructive ? " is-destructive" : ""}`}
                    disabled={item.disabled}
                    onClick={() => {
                        if (item.disabled) return;
                        item.onSelect();
                        onClose();
                    }}>
                    {item.icon && <span className="fls-context-menu-icon">{item.icon}</span>}
                    <span className="fls-context-menu-label">{item.label}</span>
                </button>
            ))}
        </div>
    );
}


export default ContextMenu;
