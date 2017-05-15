define('ui/components/machine/driver-%%DRIVERNAME%%/component', ['exports', 'ember', 'ui/mixins/driver'], function (exports, _ember, _uiMixinsDriver) {
  exports['default'] = _ember['default'].Component.extend(_uiMixinsDriver['default'], {
    driverName     : '%%DRIVERNAME%%',
    fiwareImages   : fiwareImages,
    fiwareRegions  : fiwareRegions,
    fiwareFlavors  : [],
    fiwareSecGroups: [],
    fiwareNetworks : [],
    fiwarefippool  : [],
    tenants        : [],
    regions        : [],
    secGroups      : [],
    toggleSec      : "dropdown-content", 
    step           : 1,
    isStep1        : Ember.computed.equal('step', 1),
    isStep2        : Ember.computed.equal('step', 2),
    isStep3        : Ember.computed.equal('step', 3),
    isStep4        : Ember.computed.equal('step', 4),

    // Write your component here, starting with setting 'model' to a machine with your config populated
    bootstrap: function() {
      let store = this.get('store');
      let config = store.createRecord({
        type            : '%%DRIVERNAME%%Config',
        username        : '',
        password        : '',
        tenantId        : '',
        region          : '',
        authUrl         : 'http://cloud.lab.fiware.org:4730/v2.0/',
        authUrlv3       : 'http://cloud.lab.fiware.org:4730/v3/',
        imageName       : 'base_ubuntu_14.04',
        secGroups       : '',
        netName         : '',
        floatingipPool  : '',
        flavorName      : 'm1.small',
        sshUser         : 'ubuntu',
        sshPort         : 22,
      });
      let type = 'host';

      if (!this.get('useHost')) {
        type = 'machine';
      }
      this.set('model', store.createRecord({
        type: type,
        '%%DRIVERNAME%%Config': config,
      }));
    },

    // Add custom validation beyond what can be done from the config API schema
    validate() {
      // Get generic API validation errors
      this._super(); 
      var errors = this.get('errors')||[];

      // Set the array of errors for display,
      // and return true if saving should continue.
      if ( errors.get('length') )
      {
        this.set('errors', errors);
        return false;
      }
      else
      {
        this.set('errors', null);
        return true;
      }
    },

    actions: {
       authenticated: function(obj){
         let self = this;
         function SecGroups(obj){
           self.set('fiwareSecGroups', obj.security_groups);
         }

         function Flavors(obj){
           self.set('fiwareFlavors', obj.flavors);
         }

         function fip(obj){
           self.set('model.%%DRIVERNAME%%Config.floatingipPool', obj.floating_ip_pools[0]['name']);
           self.set('fiwarefippool', obj.floating_ip_pools);
         }

         function networks(obj){
           //removing external networks
           obj = obj.filter(item => item['router:external'] !== true);
           self.set('model.%%DRIVERNAME%%Config.netName', obj[0]['name']);
           self.set('fiwareNetworks', obj);
         }

         function err(err){
           self.set('errors', [err]);
           return false;
         }

         JSTACK.Nova.params.baseurl = this.get('settings').get('api$host') + '/v2-beta/proxy/';
         JSTACK.Nova.getflavorlist(null, Flavors, err, this.get('model.%%DRIVERNAME%%Config.region'));
         JSTACK.Nova.getfloatingIPpools(fip, err, this.get('model.%%DRIVERNAME%%Config.region'));
         JSTACK.Nova.getsecuritygrouplist(SecGroups, err, this.get('model.%%DRIVERNAME%%Config.region'));
         JSTACK.Neutron.params.baseurl = this.get('settings').get('api$host') + '/v2-beta/proxy/'
         JSTACK.Neutron.getnetworkslist(networks, err, this.get('model.%%DRIVERNAME%%Config.region'));
         this.set('step', 4);
       },
       auth_err: function(err) {
         // still very basic error handling
         if (err === 3){
           this.set('errors', ['(401) Unauthorized.'])
           return false;
         }
       },
       authenticate: function(){ 
         var errors = []; 
         this.set('errors', []);
         let self = this;
         if(!this.get('model.%%DRIVERNAME%%Config.username')) {
           errors.push('Username required.');
         }
         if(!this.get('model.%%DRIVERNAME%%Config.password')) {
           errors.push('Password required.');
         }
         if (errors.get('length')){
           this.set('errors', errors);
           return false;
         }
         function send_auth_err(err){
           self.send('auth_err', err);
         }
         function send_authenticated(obj){
           self.send('authenticated', obj);
         }
         function getTenants(token){
           function validate_tenants(tenants){
             tenants = tenants.tenants
             tenants = tenants.filter(item => item['is_cloud_project']);
             if (tenants.length == 1) {
               tenant = tenants[0];
               self.set('model.%%DRIVERNAME%%Config.tenantId', tenant.id);
               self.send('checkTenant');
             } else {
               self.set('step', 2);
               self.set('model.%%DRIVERNAME%%Config.tenantId', tenants[0]['id']); 
               self.set('tenants', tenants);
               tenant = tenants[0];
             } 
           }
           JSTACK.Keystone.gettenants(validate_tenants); 
         }

         JSTACK.Keystone.init(this.get('settings').get('api$host') + '/v2-beta/proxy/' + this.get('model.%%DRIVERNAME%%Config.authUrl'));
         JSTACK.Keystone.authenticate(this.get('model.%%DRIVERNAME%%Config.username'),
                                      this.get('model.%%DRIVERNAME%%Config.password'), 
                                      undefined, 
                                      undefined, 
                                      getTenants,
                                      send_auth_err);
      },
       checkRegion: function(obj){
         let endpoints = obj.access.serviceCatalog;
         let compute_endpoint = endpoints.filterBy('type', 'compute');
         let regions = [];
         for (i=0; i < compute_endpoint[0].endpoints.length; i++){
          if(!(regions.includes(compute_endpoint[0].endpoints[i]['region']))){
            regions.push(compute_endpoint[0].endpoints[i]['region'])
          }
         };
         if (regions.length == 1){
          this.set('model.%%DRIVERNAME%%Config.region', regions[0]);
          this.send('authenticated');
         } else {
          this.set('regions', regions);
          this.set('model.%%DRIVERNAME%%Config.region', regions[0]);
          this.set('step', 3);
         }
       },
       regionSelected: function(){
        this.send('authenticated');
       },
       checkTenant: function(){
         let self = this;
         function send_auth_err(err) {
           self.send('auth_err', err);
         }
         function send_authenticated(obj){
           self.send('authenticated', obj);
         }
         function send_check_region(obj){
          self.send('checkRegion', obj);
         }
         /*Workaround to retrieve Region for user
                   First, the user is authenticated using keystone v2 endpoint to retrieve tenant information
                   then keystone v3 endpoint is used to retrieve regions associated with that tenant  */
         JSTACK.Keystone.init(self.get('settings').get('api$host') + '/v2-beta/proxy/' + self.get('model.%%DRIVERNAME%%Config.authUrlv3'));
         JSTACK.Keystone.authenticate(self.get('model.%%DRIVERNAME%%Config.username'),
                                      self.get('model.%%DRIVERNAME%%Config.password'),
                                      undefined, self.get('model.%%DRIVERNAME%%Config.tenantId'), send_check_region, send_auth_err);
      },
       instanceConfig: function(){
         this.set('errors', null);
         if(!this.get('model.hostname')) {
           this.set('errors', ['Name required.']);
           return;
         }
         if(!this.get('model.%%DRIVERNAME%%Config.netName')) {
           this.set('errors', ['Network name required.']);
           return;
         }
         this.set('step', 3);
      },
       back: function(){
         this.set('step', this.get('step')-1);
      },
       selectImage: function(slug){
        this.set('model.%%DRIVERNAME%%Config.imageName', slug);
        image = fiwareImages.filter(item => item['slug'] === slug);
        this.set('model.%%DRIVERNAME%%Config.sshUser', image[0]['ssh_user']); 
      },
       toggleVisible: function(){
        if (this.get('toggleSec') == 'dropdown-content'){
          this.set('toggleSec', 'dropdown-content-visible');
        } else {
          this.set('toggleSec', 'dropdown-content');
        }
       },
       secGroupList: function(item, isChecked){
        if(isChecked){
          this.get('secGroups').addObject(item);
        } else {
          this.get('secGroups').removeObject(item);
        }
          this.set('model.%%DRIVERNAME%%Config.secGroups', this.get('secGroups').join());
       },
    },
  });
});
