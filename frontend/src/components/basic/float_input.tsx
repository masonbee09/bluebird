import { Component } from "react";
import type { CSSProperties, ChangeEvent } from "react";
import "./int_input.css"



interface FloatInputState {
    value: string;
    focused: boolean;
}


interface FloatInputProps {
    text: string;
    cssClass: string;
    placeHolder: string;
    onChange?: (value : number | null) => void;
    style?: CSSProperties;
    value?: number | string | null;
}


function formatExternalValue(v: number | string | null | undefined): string {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') {
        if (!isFinite(v)) return '';
        return String(Math.round(v * 1000) / 1000);
    }
    return v;
}


class FloatInput extends Component<FloatInputProps, FloatInputState> {
    static defaultProps: Partial<FloatInputProps> = {
        text: "Integer Input",
        cssClass: "integer-input-box",
        placeHolder: "Enter Value"
    }
    state: FloatInputState = {
        value: formatExternalValue((undefined as unknown) as number | null),
        focused: false,
    }

    constructor(props: FloatInputProps) {
        super(props);
        this.state = { value: formatExternalValue(props.value), focused: false };
    }

    componentDidUpdate(prevProps: FloatInputProps) {
        if (prevProps.value !== this.props.value) {
            const next = formatExternalValue(this.props.value);
            // While the user is actively typing partial float forms (e.g. "0.")
            // keep the in-progress text and don't force-normalize from parent.
            const inProgress = this.state.value === '-' || this.state.value === '.' || this.state.value === '-.' || this.state.value.endsWith('.');
            if (this.state.focused && inProgress) return;
            if (next !== this.state.value) {
                this.setState({ value: next });
            }
        }
    }

    handleChange = (event: ChangeEvent<HTMLInputElement>) => {
        const rawValue = event.target.value;
        const floatRegex = /^-?(\d+(\.\d*)?|\.\d*)$/;
        const { onChange } = this.props; // Destructure the parent's callback

        if (rawValue === '' || floatRegex.test(rawValue)) {
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

    handleFocus = () => {
        this.setState({ focused: true });
    };

    handleBlur = () => {
        const { onChange } = this.props;
        const raw = this.state.value.trim();
        let normalized = raw;
        if (raw === ".") normalized = "0.";
        else if (raw === "-.") normalized = "-0.";
        else if (raw.startsWith(".")) normalized = `0${raw}`;
        else if (raw.startsWith("-.")) normalized = `-0${raw.slice(1)}`;
        const numericValue = normalized === '' || normalized === '-' || normalized === '.' || normalized === '-.'
            ? null
            : Number(normalized);
        const renderValue = Number.isFinite(numericValue as number)
            ? formatExternalValue(numericValue as number)
            : '';
        this.setState({ value: renderValue, focused: false });
        if (onChange) onChange(Number.isFinite(numericValue as number) ? (numericValue as number) : null);
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
            onFocus={this.handleFocus}
            onBlur={this.handleBlur}
            placeholder={placeHolder}
            style={style}
            className={cssClass}
            />
        </span>
        );
    }
}

export default FloatInput