import { Component } from "react";
import type { CSSProperties, ChangeEvent } from "react";
import "./checkbox.css"



interface CheckboxProps {
    label: string;
    onChange?: (isChecked: boolean) => void;
    defaultChecked?: boolean;
    cssClass: string;
    style?: CSSProperties;
}

interface CheckboxState {
    isChecked: boolean;
}


class Checkbox extends Component<CheckboxProps, CheckboxState> {
    static defaultProps: Partial<CheckboxProps> = {
        defaultChecked: false,
        cssClass: "checkbox-wrapper",
    };
    
    constructor(props: CheckboxProps) {
        super(props);
        this.state = {
            isChecked: props.defaultChecked!, 
        };
    }
    handleChange = (event: ChangeEvent<HTMLInputElement>) => {
        const newCheckedStatus = event.target.checked;
        const { onChange } = this.props;
        this.setState({ isChecked: newCheckedStatus });
        if (onChange) {
            onChange(newCheckedStatus);
        }
    };

    render() {
        const { label, style, cssClass } = this.props;

        return (
            <label className={cssClass} style={style}>
                <input
                    type="checkbox"
                    defaultChecked={this.state.isChecked}
                    onChange={this.handleChange}
                />
                <span className="checkbox-custom-look"></span>
                {label}
            </label>
        );
    }
}

export default Checkbox;