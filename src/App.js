import React, { Component } from 'react';
import pokeTrackr from './poke-trackr'
import googleMaps from 'google-maps'
import './App.css';

class App extends Component {
  componentDidMount() {
    this.loadGoogleMaps()
  }
  loadGoogleMaps() {
    console.log('g')
    googleMaps.KEY = 'AIzaSyDhygerdTR0ajzN-28rdVWDli2J4z7lTB0'
    googleMaps.load(google => {
      const googleMapsContainerElement = document.getElementById('googleMapsContainer')
      new google.maps.Map(googleMapsContainerElement, {
      center: {
        lat: 34.0081311709505,
        lng: -118.49679708480834
      },
      zoom: 15
    })
    })
  }
  render() {
    return (
      <div className="App">
        <div id="googleMapsContainer"></div>
      </div>
    );
  }
}

export default App;
