import { Auth } from 'aws-amplify'
import React, { Component } from 'react'
import { Card, Col, Container, Row } from "react-bootstrap";
import AWS from 'aws-sdk'
import awsconfig from './aws-exports'
import awsiot from './aws-iot'
import AWSIoTData from 'aws-iot-device-sdk'
import Switch from 'react-switch'


const MaxSamples = 50
const Board_id_label = "Board_id"


class SwitchCard extends Component {
  constructor(props) {
    super(props)
    
    this.state = {
      checked: false
    }
  }
  
  componentWillReceiveProps = (nextProps) => {
    this.props = nextProps
    this.setState({
      checked: nextProps.checked
    })
  }
  
  handleChange = (checked) => {
    // this.setState({ checked });
    
    (this.props.doUpdate && this.props.doUpdate(this.props.id, checked))
  }
  
  
  render() {
    return (
      <Card bg='light'>
        <Card.Title>{this.props.title}</Card.Title>
        <Card.Body>
          <Switch onChange={this.handleChange} checked={this.state.checked} className='react-switch' />
        </Card.Body>
      </Card>
    )
  }
}

class Temperature extends Component {
  constructor(props) {
    super(props)
    
    this.state = {
      temp: '--',
      
      enabled: false,
      active: false,
      heaterEnabled: false
    }
  }
  
  componentWillReceiveProps = (nextProps) => {
    this.props = nextProps
    this.setState({
      temp: nextProps.temp,
      setPoint: nextProps.setPoint,
      updateSetPoint: nextProps.updateSetPoint,
      
      enabled: nextProps.enabled,
      active: nextProps.active,
      heaterEnabled: nextProps.heaterEnabled
    })
  }
  
  render() {
    const width = '12rem'
    const fontSize = 'calc(10px + 2vmin)'
    
    let setBlock = ''
    if (this.state.setPoint !== undefined) {
      setBlock = (
        <Row>
          <Col><input
            id={this.props.title}
            type="text"
            defaultValue={this.state.setPoint}
            placeholder='setpoint'
            maxLength='4'
            size='4'
          /></Col>
          <Col><Switch
            checked={this.state.heaterEnabled}
            className="react-switch"
          /></Col>        
        </Row>
      )
    }
    
    const offline = (this.state.enabled) ? '' : (    
      <Card.Subtitle className="mb-2 text-muted">Pump Offline</Card.Subtitle>
    )
    const active = (!this.state.active) ? '' : (
      <span style={{
        textAlign: 'right'
      }}>
        <svg width="1em" height="1em" viewBox="0 0 16 16" class="bi bi-check-circle-fill" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
          <path fill-rule="evenodd" d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zm-3.97-3.03a.75.75 0 0 0-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-.01-1.05z"/>
        </svg>
      </span>
    )
    const variant = (this.state.enabled) ? this.props.variant.toLowerCase() : 'secondary'

    return(
      <Card bg={variant} style={{ 
        width: {width}, 
        fontSize: {fontSize} 
      }}>
        <Card.Title>{this.props.title}  {active}</Card.Title>
        <Card.Body>
          <h1>{this.state.temp}</h1>
          {setBlock}
        </Card.Body>
      </Card>    
    )
  }
}

/*
 * Dashboard2
 *
 *  set thingName= to subscribe to a single thing's shadow
 */
class Dashboard extends Component {
  constructor(props) {
    super(props)

    this.state = {
      messages: [],       // reverse-time ordered FIFO of last MaxSamples
      metrics: ["Time"]   // metrics accummulates all keys ever seen in the messages -- but Time is first measurement
    }
    this.client = null

    this.setupSubscription = this.setupSubscription.bind(this)

    this.componentDidMount = this.componentDidMount.bind(this)
  }

  getCurrentCredentials = () => {
    return new Promise((resolve, reject) => {
      Auth.currentUserCredentials()
        .then(creds => resolve(creds))
        .catch(err => reject(err))
    })
  }

  attachIotPolicy = (identityId) => {
    console.log(`Attaching ${awsiot.policy_name} to ${identityId}`)
    return new Promise((resolve, reject) => {
      const iot = new AWS.Iot({apiVersion: '2015-05-28'});
      iot.attachPolicy({
        policyName: awsiot.policy_name,
        target: identityId
      }, (err, data) => {
        if (err) {
          console.log(err)
          reject(err)
        } else {
          resolve(data)
        }
      })
    })
  }


  setupSubscription = (thingName) => {
    console.log(`setting up subscription for ${thingName}`)
    this.getCurrentCredentials().then((creds) => {
      console.log(creds)
      const essentialCreds = creds;

      AWS.config.update({
        region: awsconfig.aws_project_region,
        credentials: essentialCreds
      })
      this.attachIotPolicy(creds.identityId).then(() => {
        try {
          this.shadows = AWSIoTData.thingShadow({
            region: awsiot.aws_pubsub_region,
            host: awsiot.aws_iot_endpoint,
            clientId: awsconfig.aws_user_pools_web_client_id + (Math.floor((Math.random() * 100000) + 1)),
            protocol: 'wss',
            maximumReconnectTimeMs: 8000,
            debug: true,

            accessKeyId: essentialCreds.accessKeyId,
            secretKey: essentialCreds.secretAccessKey,
            sessionToken: essentialCreds.sessionToken
          })
        } catch (err) {
          console.log('error: ' + err)
        }

        this.shadows.on('connect', function() {
          // After connecting to the AWS IoT platform, register interest in the
          // Thing Shadow
          console.log('..onConnect')
          if (!this.shadowRegistered) {
            console.log('registering ' + thingName);

            this.shadows.register(thingName, {
              ignoreDeltas: true
            }, function() {
              this.getThingState();
            }.bind(this));
            this.shadowRegistered = true;
          } else {
            this.getThingState();
          }
        }.bind(this));

        this.shadows.on('message', (topic, message) => {
          this.handleTopicMessage(JSON.parse(message))
        })

        this.shadows.on('status', function(thingName, stat, clientToken, stateObject) {
          if ((  (clientToken === this.clientTokenUpdate) ||
                (clientToken === this.clientTokenGet)) &&
              (stat === 'accepted')) {
               this.handleNewThingState(stateObject);
          }
        }.bind(this));

        this.shadows.on('foreignStateChange', function(thingName, operation, stateObject) {
          // refetch the whole shadow
          this.clientTokenGet = this.shadows.get(thingName)
        }.bind(this))
      } )
    })
  }

  componentWillReceiveProps = (nextProps) => {
    if ((this.props.thingName !== nextProps.thingName) ||
        (this.props.topic !== nextProps.topic)) {
      this.setupSubscription(nextProps.thingName)
    }
  }

  componentDidMount() {
    if (this.props.topic !== undefined) {
      const parts = this.props.topic.split("/")
      this.setupSubscription(parts[parts.length - 1])
    } else if (this.props.thingName !== undefined) {
      this.setupSubscription(this.props.thingName)
    }
  }

  getThingState() {
    this.clientTokenGet = this.shadows.get(this.props.thingName);
  }

  handleNewThingState(stateObject) {
    if (stateObject.state.reported === undefined) {
      console.warn("no reported thing state");
    } else {
      console.log(stateObject.state.reported)

      this.handleTopicMessage(stateObject.state.reported)
    }
  }

  handleTopicMessage(message) {
    message["Time"] = new Date().toLocaleTimeString()
    console.log(`received message ${JSON.stringify(message)}`)

    this.setState({
      messages: [message, ...this.state.messages.slice(0, MaxSamples - 1)],
      metrics: [...new Set([...this.state.metrics, ...Object.keys(message)])],
    })
  }

  getLatestBoardMetrics(board_id, labels) {
    const message = this.state.messages.map((m) => (m[Board_id_label] === board_id) && m).reduce((a,c) => a || c, undefined)

    let metrics = new Array(labels.length)
      .fill(0)
    if (message !== false)
      metrics = metrics.map((l, i) => message[labels[i]])

    return metrics
  }

  updateCircuit = (ckt, state) => {
    console.log("updating " + ckt + " to be " + state)
    
    let newState = {state: {desired: {}}}
    newState.state.desired[ckt] = state
    this.clientTokenUpdate = this.shadows.update(this.props.thingName, newState)
  }

  render() {
    const tLabels = this.state.metrics; 
    const xLabels = this.state.metrics; 
    const yLabels = [...new Set(this.state.messages.map((m) => m[Board_id_label]))].sort()
    const data = []
    for (let i = 0; i < yLabels.length; i++) {
      const row = this.getLatestBoardMetrics(yLabels[i], xLabels)
      data.push(row)
    }
    
    let statusStrip = ''

    if (((this.props.thingName === undefined) || (this.props.thingName === '')) && (yLabels.length <= 0)) {
        return(<div></div>)
    } else {
      const m = (this.state.messages.length > 0) ? this.state.messages[0] : {}
      const airCard = (
        <Temperature title='AIR' variant='success' temp={m['airTemp']} enabled='true' />
      )
      const poolCard = (
        <Temperature title='POOL' variant='primary' 
          temp={m['waterTemp']} setPoint={m['poolSetTemp']} heaterEnabled={m['poolHeaterMode']}
          enabled={m['pumpStarted']} active={m['pool'] && !m['spa']} />
      )
      const spaCard = (
        <Temperature title='SPA' variant='warning' 
          temp={m['spaTemp']} setPoint={m['spaSetTemp']} heaterEnabled={m['spaHeaterMode']}
          enabled={m['pumpStarted']} active={m['spa']} />
      )
      
      const pumpCard = (
        <Card variant={m['pumpStarted'] ? 'info' : 'light'}>
          <Card.Title>PUMP</Card.Title>
          <Card.Body>
            <Switch
              checked={m['pumpStarted']}
              className="react-switch"
            />
            <h6>{m['pumpRPM']} RPM</h6>
            <h6>{m['pumpWatts']} Watts</h6>
          </Card.Body>
        </Card>
      )
      
      const purpleAirCard = (
          <div id='PurpleAirWidget_3894_module_AQI_conversion_C0_average_10_layer_standard'>Loading PurpleAir Widget...</div>
        )

      
      statusStrip = (
        <Row>
        <Col>{airCard}</Col><Col>{pumpCard}</Col><Col>{poolCard}</Col><Col>{spaCard}</Col>
        </Row>
      )      
    
      const poolLightCard = (
        <SwitchCard title="Pool Light" 
          checked={m['aux2']} 
          id='aux2' doUpdate={this.updateCircuit} />
      )
      
      const spaLightCard = (
        <SwitchCard title="Spa Light" checked={m['aux3']} 
          id='aux3' doUpdate={this.updateCircuit}/>
      )
      
      const cleanerCard = (
        <SwitchCard title="Waldo" checked={m['aux1']} 
        id='aux1' doUpdate={this.updateCircuit}/>
      )
      
      const jetsCard = (
        <SwitchCard title="Spa Jets" checked={m['feature1']}
        id='feature1' doUpdate={this.updateCircuit}/>
      )

      const controlStrip = (
        <Row>
          <Col>{poolLightCard}</Col><Col>{spaLightCard}</Col><Col>{cleanerCard}</Col><Col>{jetsCard}</Col>
        </Row>
      )

      
      return (
        <Container fluid>
          <Row />
          <Row>
            <Col>{purpleAirCard}</Col>
            <Col>
              <Row><Col>{airCard}</Col></Row>
              <Row><Col>{poolCard}</Col></Row>
              <Row><Col>{spaCard}</Col></Row>
            </Col>
          </Row>
          <Row />
          <Row>
            <Col>{pumpCard}</Col>
            <Col>
              <Row>
                <Col>{cleanerCard}</Col><Col>{poolLightCard}</Col>
              </Row>
              <Row>
                <Col>{jetsCard}</Col><Col>{spaLightCard}</Col>
              </Row>
            </Col>
          </Row>
          
          <Row />
        </Container>
      )
    }
  }
}

export default Dashboard