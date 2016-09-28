server 'socket.goodcity.hk:62422', user: 'deployer', roles: %w{web}, primary: true
server 'goodcity-production.cloudapp.net:62423', user: 'deployer', roles: %w{web}
set :branch, :live
