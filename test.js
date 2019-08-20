const os = require('os')
const path = require('path')
const test = require('tape')
const fs = require('fs-extra')
const Hyperdrive = require('hyperdrive')

const StoreServer = require('./server')
const StoreClient = require('./client')
const storage = require('./storage')

const LOCAL_SERVICE = 'http://localhost:3472'

test('Talk to server with client', async (t) => {
  try {
    const tmpFolder = path.join(os.tmpdir(), 'dat-store-' + Math.random().toString().slice(2, 16))
    const configLocation = path.join(tmpFolder, 'config')
    const storageLocation = path.join(tmpFolder, 'storage')
    const hyperdriveLocation = path.join(tmpFolder, 'drive')

    const client = new StoreClient({
      configLocation
    })

    t.pass('Initialized client')

    const server = await StoreServer.createServer({
      storageLocation,
      verbose: false
    })

    t.pass('Initialized server')

    await client.login('example', 'example')

    t.pass('Logged in')

    await client.logout()

    t.pass('Logged out')

    const toSet = 'http://weeee'

    await client.setService(toSet)

    t.pass('Set service')

    t.equals(await client.getService(), toSet, 'Service persisted')

    await client.unsetService()

    t.pass('Unset service')

    t.equals(await client.getService(), LOCAL_SERVICE, 'Service set to default')

    const provider = 'example'
    const providerURL = 'example-service.com'

    const providerClient = new StoreClient({
      configLocation,
      provider
    })

    t.pass('Create a client with provider name')

    await providerClient.setService(providerURL)

    t.pass('Set service with provider')

    const persistedProviderURL = await providerClient.getService()

    t.equals(persistedProviderURL, providerURL, 'Provider service persisted')

    const DAT_PROJECT_KEY = 'dat://60c525b5589a5099aa3610a8ee550dcd454c3e118f7ac93b7d41b6b850272330'
    const DAT_PROJECT_DOMAIN = 'dat://dat.foundation'

    await client.add(DAT_PROJECT_DOMAIN)

    t.pass('Added archive')

    const { items } = await client.list()
    const [{ url }] = items

    t.equals(url, DAT_PROJECT_KEY, 'Archive got added to list')

    await client.remove(DAT_PROJECT_KEY)

    t.pass('Removed archive')

    const { items: finalItems } = await client.list()

    t.deepEquals(finalItems, [], 'Key got removed')

    const tmpArchive = new Hyperdrive(storage(path.join(hyperdriveLocation, '.dat')))

    // Generate the metadata, then close
    await new Promise((resolve) => tmpArchive.ready(resolve))
    await new Promise((resolve) => tmpArchive.close(resolve))

    await client.add(hyperdriveLocation)

    t.pass('Added archive from folder')

    const { items: localItems } = await client.list()
    const [{ url: localURL }] = localItems

    const expectedKey = `dat://` + tmpArchive.key.toString('hex')

    t.equals(localURL, expectedKey, 'Local archive got loaded')

    await server.destroy()

    t.pass('Destroyed server')

    const newServer = await StoreServer.createServer({
      storageLocation,
      verbose: false
    })

    t.pass('Able to load server up again')

    const { items: localItems2 } = await client.list()
    const [{ url: localURL2 }] = localItems2

    t.equals(localURL2, expectedKey, 'Local archive got loaded')

    const exampleFileName = 'example.txt'
    const exampleFileLocation = path.join(hyperdriveLocation, exampleFileName)
    const exampleFileData = 'Hello World'

    await fs.writeFile(exampleFileLocation, exampleFileData)

    // Wait for the archive to detect the write
    await new Promise((resolve) => setTimeout(resolve, 1000))

    await client.remove(hyperdriveLocation)

    t.pass('Removed local archive')

    const tmpArchive2 = new Hyperdrive(storage(path.join(hyperdriveLocation, '.dat')))

    // Generate the metadata, then close
    await new Promise((resolve) => tmpArchive2.ready(resolve))

    const readExampleFileData = await new Promise((resolve, reject) => {
      tmpArchive2.readFile(exampleFileName, 'utf8', (err, data) => {
        if (err) reject(err)
        else resolve(data)
      })
    })

    t.equals(readExampleFileData, exampleFileData, 'Data synced from folder')

    await new Promise((resolve) => tmpArchive2.close(resolve))

    await newServer.destroy()

    t.pass('Destroyed server')

    await fs.remove(tmpFolder)

    t.end()
  } catch (e) {
    console.log(e.stack)
    t.fail(e)
  }
})
