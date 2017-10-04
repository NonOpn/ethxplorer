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

# Structures

## blocks.js

The goal of this file is to retrieve at regular intervals the blockchain using batches. It takes a group of blocks to read, gets the blocks from geth/parity and then processes every transactions in those blocks.

Using the transaction's hash, it makes sure every transaction is processed only once.

## server/api_v1

It provides a simple route
# Roadmap & updates

End September, finish the api to read Transactions from a given address.
End October, add real time mqtt transaction "alert"

Pull Requests and forks are welcomed ! Thanks for contributing !
# License

```
EthXplorer
Copyright (C) 2017 - NonOpn / Kévin Le Perf

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
```
