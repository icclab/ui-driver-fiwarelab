# ui-driver-fiwarelab
FIWARELab Rancher UI driver

## Using

* Add a Machine Driver in Rancher (Admin tab -> Settings -> Machine Drivers)
  * Download URL: https://github.com/icclab/ui-driver-fiwarelab/releases/download/v0.0.3/docker-machine-driver-fiwarelab-linux-amd64.tar.gz
  * Custom UI URL: https://github.com/icclab/ui-driver-fiwarelab/releases/download/v0.0.3/component.js
* Wait for the driver to become "Active"
* Go to Infrastructure -> Hosts -> Add Host, your driver and custom UI should show up.

### Configuration

*  Add FIWARELab Keystone, Nova and Neutron endpoints in Rancher (Admin tab -> Settings -> Advanced Settings -> api.proxy.whitelist)
  * For example: "...,cloud.lab.fiware.org:4730,zurich.cloud.lab.fiware.org:8774,zurich.cloud.lab.fiware.org:9696"

## Developing

*  Clone this repository into your machine`
* `npm install`
* `bower install`

This package contains a small web-server that will serve up the driver UI at `http://localhost:3000/component.js`.  You can run this while developing and point the Rancher settings there.
* `npm start`
* The compiled files are viewable at http://localhost:3000.
* **Note:** The development server does not currently automatically restart when files are changed.

### Building

For other users to see your driver, you need to build it and host the output on a server accessible from their browsers.

* `npm build`
* Copy the contents of the `dist` directory onto a webserver.
  * If your Rancher is configured to use HA or SSL, the server must also be available via HTTPS.

### Troubleshooting
*  `No 'Access-Control-Allow-Origin' header is present on the requested resource.`
  * This Custom rancher UI uses JSTACK lib as its core to get resources in FIWARELab, make sure that Rancher API URL (Admin tab -> Settings -> Host Registration URL) is the same as the URL used to access Rancher web interface.
