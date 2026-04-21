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


export function SaveIcon(props: SVGProps<SVGSVGElement>) {
    return (
        <svg {...baseProps} {...props}>
            <path d="M5 4 H16 L20 8 V20 H4 V5 A1 1 0 0 1 5 4 Z" />
            <path d="M8 4 V9 H15 V4" />
            <rect x="7" y="13" width="10" height="6" rx="0.6" />
        </svg>
    );
}


export function OpenIcon(props: SVGProps<SVGSVGElement>) {
    return (
        <svg {...baseProps} {...props}>
            <path d="M3 7 A1 1 0 0 1 4 6 H9 L11 8 H20 A1 1 0 0 1 21 9 V18 A1 1 0 0 1 20 19 H4 A1 1 0 0 1 3 18 Z" />
            <path d="M3 11 H21" />
        </svg>
    );
}


export function InfoIcon(props: SVGProps<SVGSVGElement>) {
    return (
        <svg {...baseProps} {...props}>
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <line x1="12" y1="10" x2="12" y2="17" />
            <circle cx="12" cy="7.2" r="1.2" fill="currentColor" stroke="none" />
        </svg>
    );
}


export function PdfIcon(props: SVGProps<SVGSVGElement>) {
    return (
        <svg {...baseProps} {...props}>
            <path d="M7 3 H14 L19 8 V20 A1 1 0 0 1 18 21 H7 A1 1 0 0 1 6 20 V4 A1 1 0 0 1 7 3 Z" />
            <path d="M14 3 V8 H19" />
            <text x="12" y="17.5" textAnchor="middle" fontSize="6" fontFamily="Arial, sans-serif" fontWeight="700" fill="currentColor" stroke="none">PDF</text>
        </svg>
    );
}
