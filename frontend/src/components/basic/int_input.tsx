import { Component } from "react";
import type { CSSProperties, ChangeEvent } from "react";
import "./int_input.css"



interface IntegerInputState {
    value: string;
}


interface IntegerInputProps {
    text: string;
    cssClass: string;
    placeHolder: string;
    onChange?: (value : number | null) => void;
    style?: CSSProperties;
}


class IntegerInput extends Component<IntegerInputProps, IntegerInputState> {
    static defaultProps: Partial<IntegerInputProps> = {
        text: "Integer Input",
        cssClass: "integer-input-box",
        placeHolder: "Enter Value"
    }
    state: IntegerInputState = {
        value: ''
    }

    handleChange = (event: ChangeEvent<HTMLInputElement>) => {
        const rawValue = event.target.value;
        const integerRegex = /^-?\d*$/;
        const { onChange } = this.props; // Destructure the parent's callback

        if (rawValue === '' || integerRegex.test(rawValue)) {
            // 1. Update the internal state first
            this.setState({ value: rawValue });

            // 2. Prepare the value to send to the parent's function
            const numericValue = rawValue === '' ? null : Number(rawValue);
            
            // 3. If the parent passed an onChange function, call it with the new value
            if (onChange) {
                onChange(numericValue);
            }
        }
    };

    render() {
        const {text, cssClass, placeHolder, style} = this.props;

        return (
        <span className="integer-input-wrapper">
            <label htmlFor="integer-input">{text}</label>
            <input
            type="text" // Use type="text" and regex validation for stricter control over input characters
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

export default IntegerInput