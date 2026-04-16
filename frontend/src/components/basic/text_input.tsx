import { Component } from "react";
import type { CSSProperties, ChangeEvent } from "react";
import "./text_input.css"



interface TextInputState {
    value: string;
}


interface TextInputProps {
    text: string;
    cssClass: string;
    placeHolder: string;
    onChange?: (value : string | null) => void;
    style?: CSSProperties;
}


class TextInput extends Component<TextInputProps, TextInputState> {
    static defaultProps: Partial<TextInputProps> = {
        text: "Integer Input",
        cssClass: "integer-input-box",
        placeHolder: "Enter Value"
    }
    state: TextInputState = {
        value: ''
    }

    handleChange = (event: ChangeEvent<HTMLInputElement>) => {
        const rawValue = event.target.value;
        const { onChange } = this.props;

        this.setState({ value: rawValue });

        if (onChange) {
            onChange(rawValue);
        }
    };

    render() {
        const {text, cssClass, placeHolder, style} = this.props;

        return (
        <span className="text-input-wrapper">
            <label htmlFor="text-input">{text}</label>
            <input
            type="text"
            value={this.state.value}
            onChange={this.handleChange} 
            placeholder={placeHolder}
            style={style}
            className={cssClass}
            />
        </span>
        );
    }
}

export default TextInput