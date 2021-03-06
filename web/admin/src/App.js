/*
 * Copyright 2018 DoubleDutch, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 *     http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React, { Component } from 'react'
import {CSVLink} from 'react-csv'
import './App.css'

import client from '@doubledutch/admin-client'
import Avatar from './Avatar'
import FirebaseConnector from '@doubledutch/firebase-connector'
const fbc = FirebaseConnector(client, 'qrhunt')

fbc.initializeAppWithSimpleBackend()

const adminableUsersRef = () => fbc.database.private.adminableUsersRef()
const categoriesRef = () => fbc.database.public.adminRef('categories')
const codesRef = () => fbc.database.public.adminRef('codes')
const doneDescriptionRef = () => fbc.database.public.adminRef('doneDescription')
const welcomeRef = () => fbc.database.public.adminRef('welcome')
const titleRef = () => fbc.database.public.adminRef('title')

export default class App extends Component {
  state = {
    attendees: [],
    admins: [],
    categories: [],
    codes: [],
    scansPerUserPerCategory: {},
  }

  componentDidMount() {
    fbc.signinAdmin()
    .then(user => {
      client.getUsers().then(attendees => {
        this.setState({attendees})
      })

      doneDescriptionRef().on('value', data => this.setState({doneDescription: data.val()}))
      welcomeRef().on('value', data => this.setState({welcome: data.val()}))
      titleRef().on('value', data => this.setState({title: data.val()}))

      const onChildAdded = (stateProp, sort) => data => this.setState(state => ({[stateProp]: [...state[stateProp], {...data.val(), id: data.key}].sort(sort)}))
      const onChildChanged = (stateProp, sort) => data => this.setState(state => ({[stateProp]: [...state[stateProp].filter(x => x.id !== data.key), {...data.val(), id: data.key}].sort(sort)}))
      const onChildRemoved = stateProp => data => this.setState(state => ({[stateProp]: state[stateProp].filter(c => c.id !== data.key)}))

      categoriesRef().on('child_added', onChildAdded('categories', sortByName))
      categoriesRef().on('child_changed', onChildChanged('categories', sortByName))
      categoriesRef().on('child_removed', onChildRemoved('categories'))

      codesRef().on('child_added', onChildAdded('codes', sortByName))
      codesRef().on('child_changed', onChildChanged('codes', sortByName))
      codesRef().on('child_removed', onChildRemoved('codes'))

      adminableUsersRef().on('value', data => {
        const users = data.val() || {}
        this.setState(state => {
          const codeToCategory = state.codes.reduce((ctc, code) => { ctc[code.id] = code.categoryId; return ctc }, {})
          return {
            admins: Object.keys(users).filter(id => users[id].adminToken),
            scansPerUserPerCategory: Object.keys(users).reduce((spupc, userId) => {
              spupc[userId] = Object.keys(users[userId].scans || {}).map(scannedId => codeToCategory[scannedId]).reduce((countPerCat, catId) => {
                if (catId) countPerCat[catId] = (countPerCat[catId] || 0) + 1
                return countPerCat
              }, {})
              return spupc
            }, {})
          }
        })
      })
    })
  }

  render() {
    const {attendees, categories, codes} = this.state
    return (
      <div className="App">
        { attendees
          ? <div>
              <h2>QR Code Categories <button onClick={this.newCategory} className="add">Add New</button></h2>
              <ul className="categoryList">
                { categories.map(this.renderCategory) }
              </ul>

              <div className="field">
                <label htmlFor="title">Title: </label>
                <input name="title" value={this.state.title} onChange={e => titleRef().set(e.target.value)} className="titleText" placeholder="Challenge" />
              </div>

              <div className="field">
                <div><label htmlFor="welcome">Welcome message</label></div>
                <textarea name="welcome" value={this.state.welcome} onChange={e => welcomeRef().set(e.target.value)} className="welcomeText"></textarea>
              </div>

              <div className="field">
                <label htmlFor="doneDesc">Attendee message when complete: </label>
                <input name="doneDesc" value={this.state.doneDescription} onChange={e => doneDescriptionRef().set(e.target.value)} className="completeText" />
              </div>

              <h2>QR Codes</h2>
              <span>(Attendees marked as admins can add new codes from the app)</span>
              <ul className="qrCodeList">
                { codes.map(this.renderCode) }
              </ul>

              <h2>Attendees</h2>
              <CSVLink className="csvButton" data={this.state.attendees.filter(a => this.isDone(a.id))} filename={"attendees-completed.csv"}>Export completed attendees to CSV</CSVLink>
              <ul className="userList">
                { attendees.sort(this.sortPlayers).map(this.renderUser) }
              </ul>
            </div>
          : <div>Loading...</div>
        }
      </div>
    )
  }

  renderCategory = category => {
    const { id, name, scansRequired } = category
    return (
      <li key={id}>
        <button className="remove" onClick={this.removeCategory(category)}>Remove</button>&nbsp;
        <input type="text" value={name} placeholder="Category Name" onChange={e => categoriesRef().child(id).child('name').set(e.target.value)} />&nbsp;
        <input type="number" value={scansRequired || 0} onChange={e => categoriesRef().child(id).child('scansRequired').set(+e.target.value)} min={0} max={100} />&nbsp;scans required
      </li>
    )
  }

  renderCode = code => {
    const { categoryId, id, name, value } = code
    return (
      <li key={id}>
        <button className="remove" onClick={this.removeCode(code)}>Remove</button>&nbsp;
        <input type="text" value={name} placeholder="QR Code Name" onChange={e => codesRef().child(id).child('name').set(e.target.value)} />&nbsp;
        <select value={categoryId} onChange={e => codesRef().child(id).child('categoryId').set(e.target.value)}>
          <option>--Select category--</option>
          { this.state.categories.map(c => <option value={c.id} key={c.id}>{c.name}</option>) }
        </select>&nbsp;
        <span className="payload" title={value}>{value}</span>
      </li>
    )
  }

  renderUser = user => {
    const { id, firstName, lastName } = user
    return (
      <li key={id} className={this.isDone(user.id) ? 'is-done' : 'not-done'}>
        <Avatar user={user} size={30} />
        <span className="name"> {firstName} {lastName}</span>
        { this.state.categories.map(cat => <span className="catScans" key={cat.id}>
            {cat.name}: {this.categoryScansForUser(cat.id, user.id)}
          </span>)
        }
        { this.isAdmin(id)
            ? <button className="remove" onClick={()=>this.setAdmin(id, false)}>Remove admin</button>
            : <button className="add" onClick={()=>this.setAdmin(id, true)}>Make admin</button>
        }
      </li>
    )
  }

  categoryScansForUser = (categoryId, userId) => (this.state.scansPerUserPerCategory[userId] || {})[categoryId] || 0
  isDone = userId => !!this.state.categories.length && !this.state.categories.find(cat => this.categoryScansForUser(cat.id, userId) < (cat.scansRequired || 0))

  newCategory = () => {
    categoriesRef().push({name: 'New QR Code Category'})
  }

  removeCategory = category => () => {
    if (window.confirm(`Are you sure you want to remove the QR code category '${category.name}'?`)) {
      categoriesRef().child(category.id).remove()
    }
  }

  removeCode = code => () => {
    if (window.confirm(`Are you sure you want to remove the QR code '${code.name}'?`)) {
      codesRef().child(code.id).remove()
    }
  }

  isAdmin(id) {
    return this.state.admins.includes(id)
  }

  setAdmin(userId, isAdmin) {
    const tokenRef = fbc.database.private.adminableUsersRef(userId).child('adminToken')
    if (isAdmin) {
      this.setState()
      fbc.getLongLivedAdminToken().then(token => tokenRef.set(token))
    } else {
      tokenRef.remove()
    }
  }

  sortPlayers = (a, b) => {
    const isADone = this.isDone(a.id)
    const isBDone = this.isDone(b.id)
    if (isADone !== isBDone) return isADone ? -1 : 1

    const aFirst = (a.firstName || '').toLowerCase()
    const bFirst = (b.firstName || '').toLowerCase()
    const aLast = (a.lastName || '').toLowerCase()
    const bLast = (b.lastName || '').toLowerCase()
    if (aFirst !== bFirst) return aFirst < bFirst ? -1 : 1
      return aLast < bLast ? -1 : 1
  }  
}

function sortByName(a, b) {
  return (a.name || '').toLowerCase() < (b.name || '').toLowerCase() ? -1 : 1
}