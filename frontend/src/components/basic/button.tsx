import { Component } from "react";
import type { CSSProperties } from "react";
import "./button.css"


interface ButtonProps {
    text: string;
    cssClass: string;
    onClick?: () => void;
    active?: boolean;
    disabled?: boolean;
    title?: string;
    style?: CSSProperties & {
        '--btn-bg-color'?: string;
        '--btn-hover-color'?: string;
        '--btn-active-color'?: string;
    };
}


class Button extends Component<ButtonProps> {
    static defaultProps: Partial<ButtonProps> = {
        text: "Unnamed Button",
        cssClass: "default-button-preset",
        active: false,
        disabled: false,
    }

    render() {
        const { text, cssClass, onClick, style, active, disabled, title } = this.props;
        const className = `${cssClass}${active ? " is-active" : ""}${disabled ? " is-disabled" : ""}`;

        return (
            <button
                className={className}
                onClick={onClick}
                style={style}
                disabled={disabled}
                title={title}>
                {text}
            </button>
        )
    }
}

export default Button
