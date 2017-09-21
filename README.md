# EthXplorer

[![License: GPL v3](https://img.shields.io/badge/License-GPL%20v3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

The light and simple Ethereum Explorer

# Requirements

- MySQL
- geth or parity

# Installation

Install the dependencies

```
npm install
```

Make sure that MySQL is configured ; it is recommended to use a dedicated user instead of root.

# Configuration

Copy the **.env.example** file into **.env**

```
WEB3=http<s>://<string>:<integer>
SPEEDUP=<integer>
MYSQL_HOST=<string>
MYSQL_USER=<string>
MYSQL_PASSWORD=<string>
MYSQL_DATABASE=<string>
```
Edit the configuration to match your own MySQL and geth/parity RPC ip/domain:port

# Start

```
node index.js
```

# Roadmap & updates

End September, finish the api to read Transactions from a given address.
End October, add real time mqtt transaction "alert"

Pull Requests and forks are welcomed ! Thanks for contributing !
# License

This project is licensed under the terms of the GNU GPL v3
