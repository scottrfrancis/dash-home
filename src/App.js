import React from 'react'
import { Col, Container, Row } from 'react-bootstrap'
import './App.css'
import Amplify from 'aws-amplify'
import { withAuthenticator, AmplifySignOut } from '@aws-amplify/ui-react'
import Dashboard from './Dashboard'
import awsconfig from './aws-exports'



Amplify.configure(awsconfig)

const App = () => (
  <Container fluid="md">
  <Row>
    <Col xs />
    <Col md="auto">
      <Row><Col><h1>Home Dashboard</h1></Col><Col><AmplifySignOut /></Col></Row>
      <Row/>
      <Row>
          <Dashboard thingName="pool" />
      </Row>
    </Col>
    <Col xs />
  </Row>
  </Container>
)

export default withAuthenticator(App)
