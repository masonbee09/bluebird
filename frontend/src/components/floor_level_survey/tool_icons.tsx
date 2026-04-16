import type { SVGProps } from "react";


const baseProps: SVGProps<SVGSVGElement> = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
};


export function SelectIcon(props: SVGProps<SVGSVGElement>) {
    return (
        <svg {...baseProps} {...props}>
            <path d="M5 3l0 14 4 -4 3 7 2 -1 -3 -7 6 0z" fill="currentColor" stroke="none" />
        </svg>
    );
}


export function WallIcon(props: SVGProps<SVGSVGElement>) {
    return (
        <svg {...baseProps} {...props}>
            <path d="M4 19 L9 6 L14 15 L20 9" />
            <circle cx="4" cy="19" r="1.6" fill="currentColor" stroke="none" />
            <circle cx="9" cy="6" r="1.6" fill="currentColor" stroke="none" />
            <circle cx="14" cy="15" r="1.6" fill="currentColor" stroke="none" />
            <circle cx="20" cy="9" r="1.6" fill="currentColor" stroke="none" />
        </svg>
    );
}


export function PointIcon(props: SVGProps<SVGSVGElement>) {
    return (
        <svg {...baseProps} {...props}>
            <line x1="12" y1="3" x2="12" y2="8" />
            <line x1="12" y1="16" x2="12" y2="21" />
            <line x1="3" y1="12" x2="8" y2="12" />
            <line x1="16" y1="12" x2="21" y2="12" />
            <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
        </svg>
    );
}


export function SolveIcon(props: SVGProps<SVGSVGElement>) {
    return (
        <svg {...baseProps} {...props}>
            <path d="M5 4 L19 12 L5 20 Z" fill="currentColor" stroke="currentColor" strokeLinejoin="round" />
        </svg>
    );
}


export function UndoIcon(props: SVGProps<SVGSVGElement>) {
    return (
        <svg {...baseProps} {...props}>
            <path d="M9 14l-4 -4 4 -4" />
            <path d="M5 10h9a5 5 0 0 1 0 10h-3" />
        </svg>
    );
}


export function RedoIcon(props: SVGProps<SVGSVGElement>) {
    return (
        <svg {...baseProps} {...props}>
            <path d="M15 14l4 -4 -4 -4" />
            <path d="M19 10h-9a5 5 0 0 0 0 10h3" />
        </svg>
    );
}


export function FrameIcon(props: SVGProps<SVGSVGElement>) {
    return (
        <svg {...baseProps} {...props}>
            <path d="M4 9 V4 H9" />
            <path d="M20 9 V4 H15" />
            <path d="M4 15 V20 H9" />
            <path d="M20 15 V20 H15" />
        </svg>
    );
}


export function PlusIcon(props: SVGProps<SVGSVGElement>) {
    return (
        <svg {...baseProps} {...props}>
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
    );
}


export function MinusIcon(props: SVGProps<SVGSVGElement>) {
    return (
        <svg {...baseProps} {...props}>
            <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
    );
}
