/**
 * Created by arjunMitraReddy on 7/12/2016.
 */
import panelTemplate from './../../../templates/infoPanel.hbs';
import idb from 'idb';
import autocomplete from 'jquery-autocomplete';
import _find from 'lodash/collection/find';
import _findIndex from 'lodash/array/findIndex';
import _flattenDeep from 'lodash/array/flattenDeep';
import dropdown from './../utils/jquery.dropdown';

export default function InfopanelController(dbPromise) {
    $('#stations-animation').hide();
    this._stationsOnly = [];
    this._allStopsOnly = [];
    this._allStopTimesInfo = [];
    this._allTripsInfo = [];
    this._tripsBetweenStations = [];
    this._routesBetweenStationsForEachTrip = [];
    this._dbPromise = dbPromise;
    this._getStationListFromIDB().then(()=> {
        this._processUI();
    });
}

InfopanelController.prototype._getStationListFromIDB = function() {
    return this._dbPromise.then((db) => {
        if (!db) return;
        var store = db.transaction('stops').objectStore('stops');
        return store.getAll().then((stops) => {
            stops.forEach((stop) => {
                if (stop.parent_station == '') {
                    this._stationsOnly.push(stop.stop_name.replace(' Caltrain', ''));
                }
                else {
                    stop.stop_name = stop.stop_name.replace(' Caltrain', '');
                    this._allStopsOnly.push(stop);
                }
            });
        });
    })
};

InfopanelController.prototype._processUI = function() {
    var fromBox = $('#fromstation');
    var toBox = $('#tostation');
    var boxes = [fromBox, toBox];
    var optionsForAutoComplete = {
        source:[this._stationsOnly],
        limit: this._stationsOnly.length,
        visibleLimit: 5
    };

    fromBox.autocomplete(optionsForAutoComplete);
    toBox.autocomplete(optionsForAutoComplete);
    $.each(boxes, (index, elem) => {
        elem.blur(() => {
            if (!this._stationsOnly.includes(elem.val())) {
                elem.val('');
            }
        })
    });

    $('#getTrains').click(() => {
        if (toBox.val() != '' && fromBox.val() != '') {
            this._getStationsOnClick(fromBox, toBox).then(() => {
                $('#station-list').empty();
                $('#travel-label').empty();
                $('#stations-animation').hide();
                this._appendTripsToUI(fromBox.val(), toBox.val());
            });
        }
        else {
            $('#station-list').empty();
            $('#travel-label').empty();
            $('#stations-animation').hide();
        }
    });
};

InfopanelController.prototype._appendTripsToUI = function(start, end) {
    var liArr = [];
    $('#travel-label').append(`Trains From '${start}' to '${end}':`);
    $('#stations-animation').show();
    this._routesBetweenStationsForEachTrip.forEach((stopTime) => {
        var newLi = $('<li class="route-li"><i class="glyphicon glyphicon-flag station-spacer"></i></li>');
        if (stopTime[0] && stopTime[0].trip_id) {
            newLi.append("Train - " + stopTime[0].trip_id);
            liArr.push(newLi);
        }
    });
    var errLi = $('<li class="route-li"><i class="glyphicon glyphicon-remove station-spacer"></i>No Trains!</li>');
    var stationList = $('#station-list');
    liArr.length > 0 ? stationList.append(liArr) : stationList.append(errLi);
    if (liArr.length > 0) {
        var delay = 0;
        $.each(liArr, (index, elem) => {
            delay += 10;
            setTimeout(() => {
                elem.addClass('station-show');
            }, delay);
            elem.click((e) => {
                var stations = [];
                this._routesBetweenStationsForEachTrip.forEach((innerArray) => {
                    innerArray.forEach((eachObj) => {
                        if (elem[0].innerText.includes(eachObj.trip_id)) {
                            stations.push(eachObj);
                        }
                    });
                });
                if (!$(e.target).next().is('table')) {
                    $('#station-list > table').not($(e.target).next()).hide();
                    var table = $('<table class="table table-bordered route-table"><thead><tr><th>Route</th><th>Arrival</th><th>Facilities</th></tr></thead></table>');
                    var body = $('<tbody></tbody>');
                    var parentTrs = [];
                    stations.forEach((station) => {
                        var tr = $('<tr></tr>');
                        var match = _find(this._allStopsOnly, (stop) => stop.stop_id == station.stop_id );
                        var td1 = $('<td></td>');
                        td1.append($('<i class="fa fa-train" aria-hidden="true" style="margin-right: 3px"></i>'));
                        td1.append(match.stop_name);
                        var td2 = $('<td></td>').append(station.arrival_time);
                        var td3 = $('<td></td>');
                        for (var i=0; i<match.wheelchair_boarding; i++) {
                            td3.append($('<i class="fa fa-wheelchair" aria-hidden="true" style="margin-right: 3px"></i>'));
                        }
                        tr.append([td1, td2, td3]);
                        parentTrs.push(tr);
                    });
                    body.append(parentTrs);
                    table.append(body);
                    elem.after(table);
                    setTimeout(() => {
                        table.addClass('station-show');
                    }, 10);
                }
                else {
                    if ($(e.target).next().is(':visible')) {
                        $(e.target).next().hide();
                        $(e.target).next().removeClass('station-show');

                    }
                    else {
                        $(e.target).next().show();
                        $('#station-list > table').not($(e.target).next()).hide();
                        setTimeout(() => {
                            $(e.target).next().addClass('station-show');
                        }, 10);
                    }
                }
            });

        });
    }
    else {
        setTimeout(() => {
            errLi.addClass('station-show');
        }, 10);
    }
};

InfopanelController.prototype._getStationsOnClick = function(fromBox, toBox) {
    this._clearStopsAndTrips();
    var stationAList = [];
    var stationBList = [];
    this._allStopsOnly.forEach(function(stop) {
        if (stop.stop_name == $(fromBox).val()) {
            stationAList.push(stop.stop_id);
        }
        if (stop.stop_name == $(toBox).val()) {
            stationBList.push(stop.stop_id);
        }
    });
    return this._getStopsBetweenStations(stationAList,stationBList);
};

InfopanelController.prototype._clearStopsAndTrips = function() {
    this._tripsBetweenStations = [];
    this._routesBetweenStationsForEachTrip = [];
};

InfopanelController.prototype._getStopsBetweenStations = function(stationAList, stationBList) {
    return this._dbPromise.then((db) => {
        if (!db) return;
        var store = db.transaction('stop_times').objectStore('stop_times');
        return store.getAll().then((stopTimes) => {
            this._allStopTimesInfo.push(stopTimes);
            this._allStopTimesInfo = _flattenDeep(this._allStopTimesInfo);
            var stationA = [];
            var stationB = [];
            stopTimes.forEach(function(stopTime) {
                if (stopTime.stop_id == stationAList[0] || stopTime.stop_id == stationAList[1]) {
                    stationA.push(stopTime);
                }
                if (stopTime.stop_id == stationBList[0] || stopTime.stop_id == stationBList[1]) {
                    stationB.push(stopTime);
                }
            });
            stationA.forEach((statA) => {
                stationB.forEach((statB) => {
                    if (statA.trip_id == statB.trip_id && parseInt(statA.stop_sequence) < parseInt(statB.stop_sequence)) {
                        this._tripsBetweenStations.push(statA.trip_id);
                    }
                });
            });
            this._tripsBetweenStations.forEach((tripId) => {
                var startIndex = _findIndex(this._allStopTimesInfo, function(stop) {
                    return (stop.stop_id == stationAList[0] | stop.stop_id == stationAList[1]) && stop.trip_id == tripId;
                });
                var endIndex = _findIndex(this._allStopTimesInfo, function(stop) {
                    return (stop.stop_id == stationBList[0] | stop.stop_id == stationBList[1]) && stop.trip_id == tripId;
                });
                this._routesBetweenStationsForEachTrip.push(this._allStopTimesInfo.slice(startIndex, endIndex+1));
            });
        })
    })
};