import { useMemo, useState } from 'react';
// import Button from "../components/button";
// import IntegerInput from "../components/int_input"
// import FloatInput from '../components/float_input';
// import Checkbox from '../components/checkbox';
// import TextInput from '../components/text_input';
import { Button, Checkbox, TextInput, IntegerInput, FloatInput, Canvas2D } from '../components';
import "./div_types.css"
// import type { CanvasController } from '../components/canvas2d/canvas_controller';
import { PointTool } from "../components/canvas2d/drawing_tools";
import LineGraph from '../components/graphing/linegraph';
import LineGraphLine from '../components/graphing/linegraphline';



function TestPage() {

    const [exampleText1, setExampleText1] = useState<string | null>(null);
    const [exampleValue1, setExampleValue1] = useState<number | null>(null);
    const [exampleValue2, setExampleValue2] = useState<number | null>(null);
    const [exampleValue3, setExampleValue3] = useState<number | null>(null);
    const [exampleBool1, setExampleBool1] = useState<boolean>(false);
    const [exampleBool2, setExampleBool2] = useState<boolean>(false);


    const drawPoint = (sx: number, sy: number) => {
        return (new PointTool).create(sx, sy, 3)
    }

    let xs1 = [];
    let ys1 = [];
    let ys2 = [];
    let ys3 = [];
    for (let i = -10; i < 91; i++) {
        xs1.push(i);
        ys1.push(Math.cos(i * Math.PI / 30) * 5)
        ys2.push(Math.sin(i * Math.PI / 30) * 4)
        ys3.push((100 * Math.pow(i, 2) - Math.pow(i, 3)) * 5 / 148148)
    }
    let line1 = new LineGraphLine(xs1, ys1, "white", 5)
    let line2 = new LineGraphLine(xs1, ys2, "blue", 5)
    let line3 = new LineGraphLine(xs1, ys3, "red", 5)
    const lines = useMemo(() => {
        return [line3, line2, line1]
    }, [line1, line2])



    let L = 10
    let W = -10
    let lxs = []
    let Vs = []
    let Ms = []
    let Cs = []
    let Ds = []
    let resolution = 500
    let xspacing = L / (resolution - 1)
    let A = -W * L / 2
    let c_c = W * Math.pow(L, 3) / 24

    for (let i = 0; i < L + xspacing; i += xspacing) {
        lxs.push(i);
        Vs.push(A + W * i)
        Ms.push(A * i + W * Math.pow(i, 2) / 2)
        Cs.push(A * Math.pow(i, 2) / 2 + W * Math.pow(i, 3) / 6 + c_c)
        Ds.push(A * Math.pow(i, 3) / 6 + W * Math.pow(i, 4) / 24 + c_c * i)
    }
    console.log(A, c_c)

    const Vline = useMemo(() => { return [new LineGraphLine(lxs, Vs, "green")]; }, [lxs, Vs])
    const Mline = useMemo(() => { return [new LineGraphLine(lxs, Ms, "red")]; }, [lxs, Ms])
    const Cline = useMemo(() => { return [new LineGraphLine(lxs, Cs, "blue")]; }, [lxs, Cs])
    const Dline = useMemo(() => { return [new LineGraphLine(lxs, Ds, "orange")]; }, [lxs, Ds])




    return (<>
        <div>
            <h1>Example Components</h1>


            <div>
                <Button text="Default Button" />
                <Button text="Green Button" cssClass="default-button-preset green-button-preset" />
                <Button text="Red Button" cssClass="default-button-preset red-button-preset" />
                <Button text="Console.log" onClick={print_button_pressed} />
                <Button text="Hello" cssClass='default-button-preset red-button-preset' /> 
            </div>


            <div className='splitter'></div>


            <div className='flex-container'>
                <TextInput text='TextInput 1' onChange={setExampleText1} />
            </div>
            <div className='flex-container'>
                <p className='flex-child'>Text 1 value in state: <strong>{exampleText1 || 'None yet'}</strong></p>
            </div>


            <div className='splitter'></div>


            <div className='flex-container'>
                <IntegerInput text='IntegerInput 1' onChange={setExampleValue1} />
                <IntegerInput text='IntegerInput 2' onChange={setExampleValue2} />
                <FloatInput text="FloatInput 1" onChange={setExampleValue3} />
            </div>
            <div className='flex-container'>
                <p className='flex-child'>Integer 1 value in state: <strong>{exampleValue1 || 'None yet'}</strong></p>
                <p className='flex-child'>Integer 2 value in state: <strong>{exampleValue2 || 'None yet'}</strong></p>
                <p className='flex-child'>Float 1 value in state: <strong>{exampleValue3 || 'None yet'}</strong></p>
            </div>


            <div className='splitter'></div>


            <div className='flex-container'>
                <Checkbox label='Checkbox 1' onChange={setExampleBool1} />
                <Checkbox label='Checkbox 2' onChange={setExampleBool2} />
            </div>
            <div className='flex-container'>
                <p className='flex-child'>Checkbox 1 value in state: <strong>{exampleBool1 ? "True" : "False"}</strong></p>
                <p className='flex-child'>Checkbox 2 value in state: <strong>{exampleBool2 ? "True" : "False"}</strong></p>
            </div>


            <div className='splitter'></div>

            <div className='flex-container' style={{height: "100vh"}}>
                <Canvas2D onClick={drawPoint} style={{ border: "solid 1px white", backgroundColor: "rgb(88, 88, 88)" }} />
            </div>

            <div className='splitter'></div>

            <div className='flex-container' style={{height: "100vh"}}>
                <LineGraph lines={lines} decimals={0} maxy={5} />
            </div>

            <div className='splitter'></div>

            <div className='flex-container' style={{height: "40vh"}}>
                <LineGraph lines={Vline} decimals={0} axisTextSize={10} />
                <LineGraph lines={Mline} decimals={1} axisTextSize={10} />
            </div>
            <div className='flex-container' style={{height: "40vh"}}>
                <LineGraph lines={Cline} axisTextSize={10} />
                <LineGraph lines={Dline} axisTextSize={10} />
            </div>


        </div>
    </>)
}


function print_button_pressed() {
    console.log("Button Pressed!")
}



export default TestPage;