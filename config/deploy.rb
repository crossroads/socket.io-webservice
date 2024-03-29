lock '3.18.0'

set :application, 'socket.io-webservice'
set :repo_url, 'https://github.com/crossroads/socket.io-webservice.git'
set :deploy_to, '/opt/node/socket.io-webservice'
set :linked_files, fetch(:linked_files, []).push('sites.yml', 'config.yml')
set :linked_dirs, fetch(:linked_dirs, []).push('logs', 'node_modules')
set :nvm_type, :user
set :nvm_node, 'v16.20.2'
set :nvm_map_bins, %w{node npm yarn}

namespace :npm do
  desc 'Install node modules'
  task :install do
    on roles(:web) do
      within release_path do
        execute :npm, 'install', '--production'
      end
    end
  end
end
before "deploy:updated", "npm:install"

namespace :deploy do
  task :restart do
    on roles(:web), in: :groups, limit: 3, wait: 10 do
      within release_path do
        execute :mkdir, "-p #{release_path}/tmp"
        execute :touch, "#{release_path}/tmp/restart.txt"
      end
    end
  end
end
after "deploy:published", "deploy:restart"
